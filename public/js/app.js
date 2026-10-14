import {
  parseMoney,
  moneyInputValue,
  formatMoney,
  parseQtyMilli,
  formatQty,
  checkValidity,
  parsePercentTenths,
  computeItem,
} from "./calc.js";

const STORAGE_KEY = "roznica-cen:lista:v1";

const $ = (id) => document.getElementById(id);
const el = {
  form: $("form"),
  name: $("name"),
  qty: $("qty"),
  shelf: $("shelf"),
  promo: $("promo"),
  pmN: $("pm-n"),
  pmTotal: $("pm-total"),
  pfX: $("pf-x"),
  pfY: $("pf-y"),
  ppP: $("pp-p"),
  paid: $("paid"),
  paidTotal: $("paid-total"),
  dates: $("dates"),
  buyDate: $("buy-date"),
  validFrom: $("valid-from"),
  validTo: $("valid-to"),
  validity: $("validity"),
  error: $("error"),
  result: $("result"),
  rOwed: $("r-owed"),
  rPaid: $("r-paid"),
  rLabel: $("r-label"),
  rPayout: $("r-payout"),
  add: $("add"),
  clearForm: $("clear-form"),
  empty: $("empty"),
  list: $("list"),
  totalBox: $("total-box"),
  total: $("total"),
  clearList: $("clear-list"),
  groups: {
    multi_price: $("promo-multi"),
    free: $("promo-free"),
    second_percent: $("promo-percent"),
    percent: $("promo-percent"),
  },
};

/** @type {Array<{name:string, qtyMilli:number, owed:number, paid:number, payout:number, promoLabel:string, validity:string|null}>} */
let items = loadItems();

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Starsze wpisy miały tylko całkowitą liczbę sztuk (qty).
    return parsed
      .filter((it) => it && typeof it === "object")
      .map((it) => ({
        ...it,
        qtyMilli: Number.isInteger(it.qtyMilli) ? it.qtyMilli : Number.isInteger(it.qty) ? it.qty * 1000 : 1000,
      }));
  } catch {
    return [];
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* pamięć przeglądarki może być niedostępna, aplikacja działa dalej */
  }
}

function isBlank(v) {
  return v.trim() === "";
}

function readIntOrNull(input) {
  const s = input.value.trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

function qtyText(qtyMilli) {
  return `${formatQty(qtyMilli)} ${qtyMilli % 1000 === 0 ? "szt." : "kg"}`;
}

/** 2026-10-14 -> 14.10.2026 */
function datePL(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function promoLabel(promo) {
  switch (promo.type) {
    case "multi_price":
      return `${promo.n} szt. za ${formatMoney(promo.total)}`;
    case "free":
      return `${promo.x}+${promo.y} gratis`;
    case "second_percent":
      return `-${promo.tenths / 10}% na drugą sztukę`.replace(".", ",");
    case "percent":
      return `-${promo.tenths / 10}% na produkt`.replace(".", ",");
    default:
      return "";
  }
}

/** Czyta pola formularza. Zwraca obiekt gotowy do computeItem. */
function readForm() {
  const type = el.promo.value;
  let promo = { type: "none" };
  if (type === "multi_price") {
    promo = { type, n: readIntOrNull(el.pmN), total: parseMoney(el.pmTotal.value) };
  } else if (type === "free") {
    promo = { type, x: readIntOrNull(el.pfX), y: readIntOrNull(el.pfY) };
  } else if (type === "second_percent" || type === "percent") {
    promo = { type, tenths: parsePercentTenths(el.ppP.value) };
  }
  return {
    qtyMilli: parseQtyMilli(el.qty.value),
    shelfUnit: parseMoney(el.shelf.value),
    promo,
    paidUnit: parseMoney(el.paid.value),
    paidTotal: isBlank(el.paidTotal.value) ? null : parseMoney(el.paidTotal.value),
  };
}

function setInvalid(input, invalid) {
  if (invalid) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function showPromoFields() {
  const type = el.promo.value;
  const visible = new Set();
  if (el.groups[type]) visible.add(el.groups[type]);
  new Set(Object.values(el.groups)).forEach((g) => (g.hidden = !visible.has(g)));
}

/** Zwraca komunikat, gdy wypełnione pole promocji ma niepoprawną wartość. */
function promoFieldsBroken() {
  const type = el.promo.value;
  const bad = (input, ok) => !isBlank(input.value) && !ok;
  if (type === "multi_price") {
    if (bad(el.pmN, readIntOrNull(el.pmN) >= 2)) return "Popraw liczbę sztuk w promocji (min. 2).";
    if (bad(el.pmTotal, parseMoney(el.pmTotal.value) !== null)) return "Popraw kwotę promocji (np. 10,00).";
  } else if (type === "free") {
    if (bad(el.pfX, readIntOrNull(el.pfX) >= 1)) return "Popraw liczbę płatnych sztuk (X).";
    if (bad(el.pfY, readIntOrNull(el.pfY) >= 1)) return "Popraw liczbę sztuk gratis (Y).";
  } else if (type === "second_percent" || type === "percent") {
    if (bad(el.ppP, parsePercentTenths(el.ppP.value) !== null)) return "Popraw rabat procentowy (od 0,1 do 99,9).";
  }
  return null;
}

let lastResult = null;
let lastItem = null;
let lastValidity = null;

/** Porównuje datę zakupu z okresem ważności ceny z półki i pokazuje komunikat. */
function updateValidity() {
  const v = checkValidity(el.buyDate.value, el.validFrom.value, el.validTo.value);
  lastValidity = v;
  if (v === null) {
    el.validity.hidden = true;
    return;
  }
  const range = [datePL(el.validFrom.value) || "...", datePL(el.validTo.value) || "..."].join(" do ");
  el.validity.hidden = false;
  el.validity.dataset.state = v === "ok" ? "ok" : "warn";
  if (v === "ok") {
    el.validity.textContent = `Data zakupu (${datePL(el.buyDate.value)}) mieści się w okresie ważności ceny z półki (${range}).`;
  } else if (v === "przed") {
    el.validity.textContent = `Uwaga: zakup z ${datePL(el.buyDate.value)} był przed początkiem ważności tej ceny z półki (${range}). Sprawdź, jaka cena obowiązywała w dniu zakupu.`;
  } else {
    el.validity.textContent = `Uwaga: zakup z ${datePL(el.buyDate.value)} był po końcu ważności tej ceny z półki (${range}). Sprawdź, jaka cena obowiązywała w dniu zakupu.`;
  }
}

function update() {
  const item = readForm();
  const anyInput =
    !isBlank(el.shelf.value) || !isBlank(el.paid.value) || !isBlank(el.paidTotal.value);

  setInvalid(el.qty, !isBlank(el.qty.value) && item.qtyMilli === null);
  setInvalid(el.shelf, !isBlank(el.shelf.value) && item.shelfUnit === null);
  setInvalid(el.paid, !isBlank(el.paid.value) && item.paidUnit === null);
  setInvalid(el.paidTotal, !isBlank(el.paidTotal.value) && item.paidTotal === null);
  updateValidity();

  // Wypełnione, ale niepoprawne pole to błąd do poprawy. Nie licz po cichu z innych pól.
  const promoBroken = promoFieldsBroken();
  let result;
  if (!isBlank(el.qty.value) && item.qtyMilli === null) {
    result = { ok: false, error: "Popraw ilość (np. 2 albo 1,094 dla wagi w kg)." };
  } else if (!isBlank(el.shelf.value) && item.shelfUnit === null) {
    result = { ok: false, error: "Popraw cenę z półki (np. 12,99)." };
  } else if (promoBroken) {
    result = { ok: false, error: promoBroken };
  } else if (!isBlank(el.paid.value) && item.paidUnit === null) {
    result = { ok: false, error: "Popraw cenę z paragonu (np. 12,99)." };
  } else if (!isBlank(el.paidTotal.value) && item.paidTotal === null) {
    result = { ok: false, error: "Popraw kwotę zapłaconą łącznie (np. 12,99)." };
  } else {
    result = computeItem(item);
  }

  lastResult = result;
  lastItem = item;

  if (!anyInput) {
    el.error.hidden = true;
    el.result.hidden = true;
    el.add.disabled = true;
    return;
  }

  if (!result.ok) {
    el.error.textContent = result.error;
    el.error.hidden = false;
    el.result.hidden = true;
    el.add.disabled = true;
    return;
  }

  el.error.hidden = true;
  el.result.hidden = false;
  el.result.dataset.status = result.status;
  el.rOwed.textContent = formatMoney(result.owed);
  el.rPaid.textContent = formatMoney(result.paid);
  if (result.status === "mniej") {
    el.rLabel.textContent = "Na paragonie taniej niż na półce";
    el.rPayout.textContent = formatMoney(0);
  } else if (result.status === "zgodnie") {
    el.rLabel.textContent = "Ceny zgodne, nic do wypłaty";
    el.rPayout.textContent = formatMoney(0);
  } else {
    el.rLabel.textContent = "Do wypłaty";
    el.rPayout.textContent = formatMoney(result.payout);
  }
  el.add.disabled = false;
}

function renderList() {
  el.list.textContent = "";
  items.forEach((it, index) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "li-name";
    name.textContent = it.name || `Pozycja ${index + 1}`;

    const amount = document.createElement("span");
    amount.className = "li-amount";
    amount.textContent = formatMoney(it.payout);

    const detail = document.createElement("span");
    detail.className = "li-detail";
    const parts = [qtyText(it.qtyMilli), `należało ${formatMoney(it.owed)}`, `zapłacono ${formatMoney(it.paid)}`];
    if (it.promoLabel) parts.push(it.promoLabel);
    if (it.validity === "przed" || it.validity === "po") parts.push("uwaga: poza okresem ważności ceny z półki");
    detail.textContent = parts.join(", ");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "li-remove";
    remove.textContent = "Usuń";
    remove.setAttribute("aria-label", `Usuń pozycję ${it.name || index + 1}`);
    remove.addEventListener("click", () => {
      items.splice(index, 1);
      saveItems();
      renderList();
    });

    li.append(name, amount, detail, remove);
    el.list.append(li);
  });

  const has = items.length > 0;
  el.empty.hidden = has;
  el.totalBox.hidden = !has;
  el.clearList.hidden = !has;
  if (has) {
    const total = items.reduce((acc, it) => acc + it.payout, 0);
    el.total.textContent = formatMoney(total);
  }
}

/** Czyści formularz. Data zakupu zostaje (kolejna pozycja z tego samego paragonu), chyba że keepDate=false. */
function resetForm(keepDate = true) {
  const buyDate = el.buyDate.value;
  el.form.reset();
  el.qty.value = "1";
  if (keepDate) el.buyDate.value = buyDate;
  showPromoFields();
  update();
  el.shelf.focus();
}

el.form.addEventListener("input", update);
el.promo.addEventListener("change", () => {
  showPromoFields();
  update();
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  update();
  if (!lastResult || !lastResult.ok) return;
  items.push({
    name: el.name.value.trim(),
    qtyMilli: lastItem.qtyMilli,
    owed: lastResult.owed,
    paid: lastResult.paid,
    payout: lastResult.payout,
    promoLabel: promoLabel(lastItem.promo),
    validity: lastValidity,
  });
  saveItems();
  renderList();
  // @ocr-begin
  markReceiptItemDone();
  // @ocr-end
  resetForm();
});

el.clearForm.addEventListener("click", () => resetForm(false));

// Potwierdzenie w samej stronie (okna dialogowe przeglądarki bywają zablokowane).
const CLEAR_LABEL = "Wyczyść listę";
let clearArmed = false;
let clearTimer = null;

function disarmClear() {
  clearArmed = false;
  clearTimeout(clearTimer);
  el.clearList.textContent = CLEAR_LABEL;
}

el.clearList.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    el.clearList.textContent = "Na pewno? Dotknij ponownie";
    clearTimer = setTimeout(disarmClear, 4000);
    return;
  }
  disarmClear();
  items = [];
  saveItems();
  renderList();
});

// @ocr-begin
// ---------------------------------------------------------------------------
// Zdjęcia: paragon i etykieta półkowa (OCR lokalnie w telefonie, zdjęcia nigdzie nie wychodzą)
// ---------------------------------------------------------------------------
const RECEIPT_KEY = "roznica-cen:paragon:v1";

Object.assign(el, {
  rcCamera: $("rc-camera"),
  rcGallery: $("rc-gallery"),
  rcFileCam: $("rc-file-cam"),
  rcFile: $("rc-file"),
  rcStatus: $("rc-status"),
  rcResult: $("rc-result"),
  rcMeta: $("rc-meta"),
  rcIssues: $("rc-issues"),
  rcItems: $("rc-items"),
  rcRaw: $("rc-raw"),
  rcClose: $("rc-close"),
  lbCamera: $("lb-camera"),
  lbGallery: $("lb-gallery"),
  lbFileCam: $("lb-file-cam"),
  lbFile: $("lb-file"),
  lbStatus: $("lb-status"),
});

/** @type {null | {date:string|null, time:string|null, issues:Array, sumOk:boolean, items:Array}} */
let receipt = loadReceipt();
let activeReceiptIndex = null;
let scannerPromise = null;
let receiptRaw = ""; // surowy tekst z OCR, tylko w pamięci (nie zapisujemy go w telefonie)

function loadReceipt() {
  try {
    const raw = localStorage.getItem(RECEIPT_KEY);
    const r = raw ? JSON.parse(raw) : null;
    return r && Array.isArray(r.items) ? r : null;
  } catch {
    return null;
  }
}

function saveReceipt() {
  try {
    if (receipt) localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    else localStorage.removeItem(RECEIPT_KEY);
  } catch {
    /* brak pamięci przeglądarki: paragon zostaje tylko do zamknięcia aplikacji */
  }
}

function setStatus(node, text, state) {
  node.hidden = !text;
  node.textContent = text || "";
  if (state) node.dataset.state = state;
  else delete node.dataset.state;
}

function setBusy(busy) {
  for (const b of [el.rcCamera, el.rcGallery, el.lbCamera, el.lbGallery]) b.disabled = busy;
}

function loadScanner() {
  if (!scannerPromise) {
    scannerPromise = import("./scan.js").catch((err) => {
      scannerPromise = null;
      throw err;
    });
  }
  return scannerPromise;
}

const LEVEL_PREFIX = { ok: "OK: ", warn: "Uwaga: ", info: "Info: " };

function renderReceipt() {
  el.rcResult.hidden = !receipt;
  if (!receipt) return;

  const when = [datePL(receipt.date), receipt.time].filter(Boolean).join(" ");
  el.rcMeta.textContent = `${when ? when + ", " : ""}pozycji: ${receipt.items.length}`;

  el.rcRaw.textContent = receiptRaw || "(po przeładowaniu aplikacji surowy tekst nie jest przechowywany)";
  el.rcIssues.textContent = "";
  for (const issue of receipt.issues) {
    const li = document.createElement("li");
    li.dataset.level = issue.level;
    li.textContent = (LEVEL_PREFIX[issue.level] || "") + issue.text;
    el.rcIssues.append(li);
  }

  el.rcItems.textContent = "";
  receipt.items.forEach((it, index) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rc-item";
    if (it.check) btn.dataset.check = "true";
    if (it.done) btn.dataset.done = "true";
    if (index === activeReceiptIndex) btn.setAttribute("aria-current", "true");

    const name = document.createElement("span");
    name.className = "rc-name";
    name.textContent = it.name || `Pozycja ${index + 1}`;
    const amount = document.createElement("span");
    amount.className = "rc-amount";
    amount.textContent = formatMoney(it.total - (it.discount || 0));
    const detail = document.createElement("span");
    detail.className = "rc-detail";
    const bits = [`${qtyText(it.qtyMilli)} po ${formatMoney(it.unit)}`];
    if (it.discount) bits.push(`opust -${formatMoney(it.discount)}`);
    detail.textContent = bits.join(", ");
    btn.append(name, amount, detail);

    if (it.done || it.check) {
      const tag = document.createElement("span");
      tag.className = "rc-tag";
      tag.textContent = it.done ? "Dodano do listy" : "Sprawdź kwoty przy tej pozycji";
      btn.append(tag);
    }
    btn.addEventListener("click", () => pickReceiptItem(index));
    li.append(btn);
    el.rcItems.append(li);
  });
}

/** Dotknięcie pozycji z paragonu: wypełnia formularz, zostaje tylko cena z półki. */
function pickReceiptItem(index) {
  const it = receipt && receipt.items[index];
  if (!it) return;
  activeReceiptIndex = index;
  el.form.reset();
  el.name.value = it.name;
  el.qty.value = formatQty(it.qtyMilli);
  el.paid.value = moneyInputValue(it.unit);
  if (it.discount) {
    el.paidTotal.value = moneyInputValue(it.total - it.discount);
    const details = el.paidTotal.closest("details");
    if (details) details.open = true;
  }
  if (receipt.date) el.buyDate.value = receipt.date;
  showPromoFields();
  update();
  renderReceipt();
  el.form.scrollIntoView({ behavior: "smooth", block: "start" });
  el.shelf.focus({ preventScroll: true });
}

function markReceiptItemDone() {
  if (!receipt || activeReceiptIndex === null || !receipt.items[activeReceiptIndex]) return;
  receipt.items[activeReceiptIndex].done = true;
  activeReceiptIndex = null;
  saveReceipt();
  renderReceipt();
}

function scanFailed(statusNode, err) {
  const hint = navigator.onLine
    ? ""
    : " Nie ma internetu, a przy pierwszym użyciu odczyt zdjęć pobiera jednorazowo około 7 MB.";
  setStatus(
    statusNode,
    `Nie udało się odczytać zdjęcia (${(err && err.message) || "błąd"}).${hint} Wpisz dane ręcznie.`,
    "error"
  );
}

// Dwa wejścia na zdjęcie: aparat (capture) i galeria. Na części telefonów zwykły wybór pliku pokazuje tylko galerię.
el.rcCamera.addEventListener("click", () => el.rcFileCam.click());
el.rcGallery.addEventListener("click", () => el.rcFile.click());
el.lbCamera.addEventListener("click", () => el.lbFileCam.click());
el.lbGallery.addEventListener("click", () => el.lbFile.click());

async function handleReceiptFile(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  setBusy(true);
  setStatus(el.rcStatus, "Przygotowanie zdjęcia");
  try {
    const { scanReceipt } = await loadScanner();
    const res = await scanReceipt(file, (t) => setStatus(el.rcStatus, t));
    receipt = {
      date: res.date,
      time: res.time,
      issues: res.issues,
      sumOk: res.sumOk,
      items: res.items.map((it) => ({
        name: it.name,
        qtyMilli: it.qtyMilli,
        unit: it.unit,
        total: it.total,
        discount: it.discount,
        check: it.check,
        done: false,
      })),
    };
    activeReceiptIndex = null;
    receiptRaw = res.raw || "";
    saveReceipt();
    renderReceipt();
    if (receipt.items.length) {
      setStatus(el.rcStatus, "Gotowe. Dotknij pozycji, której dotyczy sprawa.", "ok");
    } else {
      setStatus(el.rcStatus, "Nie znaleziono pozycji. Zrób zdjęcie z bliska i równo.", "error");
    }
  } catch (err) {
    scanFailed(el.rcStatus, err);
  } finally {
    setBusy(false);
  }
}
el.rcFile.addEventListener("change", () => handleReceiptFile(el.rcFile));
el.rcFileCam.addEventListener("change", () => handleReceiptFile(el.rcFileCam));

el.rcClose.addEventListener("click", () => {
  receipt = null;
  activeReceiptIndex = null;
  receiptRaw = "";
  saveReceipt();
  renderReceipt();
  setStatus(el.rcStatus, "");
});

async function handleLabelFile(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  setBusy(true);
  setStatus(el.lbStatus, "Przygotowanie zdjęcia");
  try {
    const { scanLabel } = await loadScanner();
    const res = await scanLabel(file, (t) => setStatus(el.lbStatus, t));
    if (res.price === null) {
      setStatus(el.lbStatus, "Nie widzę ceny na etykiecie. Zrób zdjęcie bliżej albo wpisz cenę ręcznie.", "error");
      return;
    }
    el.shelf.value = moneyInputValue(res.price);
    if (res.from) el.validFrom.value = res.from;
    if (res.to) el.validTo.value = res.to;
    if (res.from || res.to) el.dates.open = true;
    if (isBlank(el.name.value) && res.name) el.name.value = res.name.slice(0, 60);
    update();
    const bits = [`cena ${formatMoney(res.price)}${res.unitKind ? "/" + res.unitKind : ""}`];
    if (res.from && res.to) bits.push(`ważna ${datePL(res.from)} do ${datePL(res.to)}`);
    if (res.minQty && res.minQty > 1) bits.push(`cena przy zakupie min. ${res.minQty} szt.`);
    setStatus(el.lbStatus, `Odczytano: ${bits.join(", ")}. Porównaj z etykietą.`, "ok");
  } catch (err) {
    scanFailed(el.lbStatus, err);
  } finally {
    setBusy(false);
  }
}
el.lbFile.addEventListener("change", () => handleLabelFile(el.lbFile));
el.lbFileCam.addEventListener("change", () => handleLabelFile(el.lbFileCam));

renderReceipt();
// @ocr-end

showPromoFields();
update();
renderList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline działa tylko po poprawnej rejestracji, ale aplikacja działa i bez tego */
    });
  });
}
