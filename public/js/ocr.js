// Odczyt tekstu ze zdjęć (OCR) lokalnie w telefonie.
// Zdjęcia nie są wysyłane na żaden serwer ani nigdzie zapisywane: obraz trafia do pamięci,
// jest przetwarzany przez Tesseract uruchomiony z własnego adresu strony (public/vendor).

const VENDOR = new URL("../vendor/tesseract/", import.meta.url);
const at = (p) => new URL(p, VENDOR).href;

let workerPromise = null;
let statusListener = null;

function emit(message) {
  if (statusListener) statusListener(message);
}

function describe(m) {
  if (!m || !m.status) return null;
  const pct = typeof m.progress === "number" ? Math.round(m.progress * 100) : null;
  const names = {
    "loading tesseract core": "Ładowanie silnika odczytu",
    "initializing tesseract": "Uruchamianie silnika",
    "loading language traineddata": "Ładowanie słownika polskiego",
    "initializing api": "Przygotowanie odczytu",
    "recognizing text": "Czytanie tekstu",
  };
  const name = names[m.status];
  if (!name) return null;
  return pct === null ? name : `${name} ${pct}%`;
}

async function loadWorker() {
  // Dynamiczny import: aplikacja działa bez OCR, gdy plików w vendor/ nie ma.
  const mod = await import(at("tesseract.esm.min.js"));
  const Tesseract = mod.default || mod; // wersja ESM eksportuje całość jako default
  return Tesseract.createWorker("pol", 1, {
    workerPath: at("worker.min.js"),
    corePath: at("core/"),
    langPath: at("lang/"),
    workerBlobURL: false, // skrypt z własnego adresu, żeby service worker zapisał go do pracy offline
    logger: (m) => {
      const text = describe(m);
      if (text) emit(text);
    },
  });
}

export function getWorker() {
  if (!workerPromise) {
    workerPromise = loadWorker().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function disposeOcr() {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try {
    const w = await p;
    await w.terminate();
  } catch {
    /* nic do zwolnienia */
  }
}

/**
 * Szuka żółtej etykiety promocyjnej na zdjęciu i zwraca jej prostokąt (w pikselach obrazu) albo null.
 * Tło sklepu (granit, półki) bardzo pogarsza odczyt, więc przycinamy do samej etykiety.
 */
function findYellowBox(bmp) {
  const small = 400;
  const k = Math.min(1, small / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const cols = new Uint32Array(w);
  const rows = new Uint32Array(h);
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (r > 170 && g > 150 && b < 110 && r - b > 90) {
        cols[x]++;
        rows[y]++;
        n++;
      }
    }
  }
  if (n < w * h * 0.04) return null; // za mało żółtego: to nie jest żółta etykieta
  const edge = (arr, from, to, step, target) => {
    let acc = 0;
    for (let i = from; i !== to; i += step) {
      acc += arr[i];
      if (acc >= target) return i;
    }
    return from;
  };
  const cut = n * 0.01;
  const x1 = edge(cols, 0, w, 1, cut);
  const x2 = edge(cols, w - 1, -1, -1, cut);
  const y1 = edge(rows, 0, h, 1, cut);
  const y2 = edge(rows, h - 1, -1, -1, cut);
  if (x2 <= x1 || y2 <= y1) return null;
  const mx = (x2 - x1) * 0.03;
  const my = (y2 - y1) * 0.03;
  const sx = Math.max(0, Math.floor((x1 - mx) / k));
  const sy = Math.max(0, Math.floor((y1 - my) / k));
  const ex = Math.min(bmp.width, Math.ceil((x2 + mx) / k));
  const ey = Math.min(bmp.height, Math.ceil((y2 + my) / k));
  return { sx, sy, sw: ex - sx, sh: ey - sy };
}

/**
 * Przygotowuje zdjęcie do odczytu: zmniejsza duże zdjęcie z aparatu, powiększa małe (Tesseract czyta
 * lepiej tekst o wysokości kilkudziesięciu pikseli), zamienia na odcienie szarości.
 * cropYellow przycina do żółtej etykiety. stretch rozciąga kontrast (drugie podejście dla bladych paragonów).
 * Zwraca Blob PNG. Obraz zostaje tylko w pamięci.
 */
export async function prepareImage(file, { maxSide = 3200, maxUpscale = 2, stretch = false, cropYellow = false } = {}) {
  const bmp = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;
  if (cropYellow) {
    const box = findYellowBox(bmp);
    if (box) ({ sx, sy, sw, sh } = box);
  }
  const scale = Math.min(maxUpscale, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  if (bmp.close) bmp.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    hist[v]++;
  }
  if (stretch) {
    const total = w * h;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= total * 0.02) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v];
      if (acc >= total * 0.02) {
        hi = v;
        break;
      }
    }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / range)));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Nie udało się przygotować zdjęcia."))), "image/png");
  });
}

/**
 * Czyta tekst ze zdjęcia. mode: "receipt" (paragon, wiersze jeden pod drugim)
 * albo "label" (etykieta półkowa, tekst rozrzucony po całej powierzchni).
 * onStatus dostaje krótkie komunikaty po polsku do pokazania użytkowi.
 */
export async function readText(file, { mode = "receipt", onStatus, prepare, psm } = {}) {
  statusListener = onStatus || null;
  try {
    emit("Przygotowanie zdjęcia");
    const blob = await prepareImage(file, prepare);
    emit("Ładowanie silnika odczytu");
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: psm || (mode === "label" ? "11" : "6"),
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(blob);
    return data.text || "";
  } finally {
    statusListener = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    disposeOcr();
  });
}
