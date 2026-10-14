// Rozbiór tekstu z OCR: paragon fiskalny i etykieta półkowa.
// Czysta logika (bez przeglądarki), więc da się ją testować w Node.
// Zasada bezpieczeństwa: wynik zawsze trafia do formularza do sprawdzenia przez człowieka,
// a suma pozycji jest porównywana z sumą na paragonie, żeby wychwycić błędy odczytu.

import { parseMoney, parseQtyMilli, roundDiv, formatMoney } from "./calc.js";

const MONEY = String.raw`\d{1,6}\s?[.,]\s?\d{2}`;

// Pozycja: [nazwa] ilość x cena = kwota [litera PTU]. Ilość może być ułamkowa (waga).
const ITEM_RE = new RegExp(
  String.raw`(\d{1,3}(?:\s?[.,]\s?\d{1,3})?)\s*[x*×]\s*(${MONEY})\s*=\s*(${MONEY})`,
  "i"
);
// "OPUST ..." to opust przy pozycji; "Suma Opustów" to podsumowanie, którego tu nie liczymy.
const OPUST_RE = new RegExp(String.raw`\bOPUST(?!\p{L})\s*(.*?)\s*[-–—]\s*(${MONEY})`, "iu");
const SUM_RE = new RegExp(String.raw`SUMA\s*PL[NMH]?\s*[:=]?\s*(${MONEY})`, "i");
const DATE_RE = /(20\d{2})-(\d{2})-(\d{2})/;

const money = (s) => parseMoney(String(s).replace(/\s/g, ""));

/** OCR często czyta "1" jako "i", "l" albo "|", gdy stoi przed znakiem mnożenia. */
function fixQtyGlyphs(line) {
  return line.replace(
    new RegExp(String.raw`(^|[^\dA-Za-z])[iIl|]\s*(?=[x*×]\s*${MONEY}\s*=)`),
    (_m, before) => `${before}1`
  );
}

/** Usuwa z początku nazwy śmieci z tła (np. "Szarej", "Kzzeosz") i literę stawki PTU ("C_"). */
export function cleanName(raw) {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const isGarbage = (t) => /[a-ząćęłńóśźż]/.test(t) && !/[_]/.test(t);
  while (tokens.length > 1 && isGarbage(tokens[0])) tokens.shift();
  let name = tokens.join(" ").replace(/^[^A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż(]+/, "");
  name = name.replace(/^[A-G](?:[_.]|\s)\s*/, "");
  return name.replace(/[\s|!.,;:©]+$/, "").trim();
}

function nameTokens(name) {
  return name
    .replace(/[łŁ]/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Prawda, gdy napisy różnią się o najwyżej jeden znak (pomyłka OCR). */
function near(a, b) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function overlap(aTokens, bTokens) {
  let n = 0;
  for (const a of aTokens) if (bTokens.some((b) => near(a, b))) n++;
  return n;
}

function lineTotal(qtyMilli, unit) {
  return roundDiv(qtyMilli * unit, 1000);
}

/** Próbuje naprawić pozycję, w której iloczyn nie zgadza się z kwotą (pomyłka jednej cyfry). */
function repairItem(it) {
  if (lineTotal(it.qtyMilli, it.unit) === it.total) return false;
  // Kwota jest zwykle czytelna, a cena jednostkowa bywa zniekształcona.
  const guess = Math.round((it.total * 1000) / it.qtyMilli);
  const candidates = [];
  for (let u = guess - 2; u <= guess + 2; u++) {
    if (u > 0 && lineTotal(it.qtyMilli, u) === it.total) candidates.push(u);
  }
  if (candidates.length === 1) {
    it.unit = candidates[0];
    return true;
  }
  // Dla sztuk: błędna ilość, a cena i kwota się zgadzają (np. "8" zamiast "6").
  if (it.qtyMilli % 1000 === 0 && it.unit > 0 && it.total % it.unit === 0) {
    const q = it.total / it.unit;
    if (q >= 1 && q <= 999) {
      it.qtyMilli = q * 1000;
      return true;
    }
  }
  return false;
}

/**
 * Rozbiera tekst paragonu.
 * Zwraca { date, time, items, unmatched, sumFound, sumComputed, sumOk, issues, quality, bad }.
 * Każda pozycja: { name, qtyMilli, unit, total, discount, repaired, check }.
 */
export function parseReceipt(text) {
  const lines = String(text || "").split(/\r?\n/);
  const items = [];
  const discounts = [];
  let opustWithoutAmount = 0;

  for (const raw of lines) {
    const line = fixQtyGlyphs(raw);
    if (/\bOPUST(?!\p{L})/iu.test(line)) {
      const op = OPUST_RE.exec(line);
      if (op && money(op[2]) !== null) discounts.push({ name: cleanName(op[1]), amount: money(op[2]) });
      else opustWithoutAmount++;
      continue;
    }
    const m = ITEM_RE.exec(line);
    if (!m) continue;
    const qtyMilli = parseQtyMilli(m[1].replace(/\s/g, ""));
    const unit = money(m[2]);
    const total = money(m[3]);
    if (qtyMilli === null || unit === null || total === null) continue;
    const name = cleanName(line.slice(0, m.index));
    const item = { name, qtyMilli, unit, total, discount: 0, repaired: false, check: false };
    item.repaired = repairItem(item);
    item.check = lineTotal(item.qtyMilli, item.unit) !== item.total;
    items.push(item);
  }

  // Przypisanie opustów do pozycji po nazwie (odporne na jedną pomyłkę w słowie).
  const unmatched = [];
  for (const d of discounts) {
    const dt = nameTokens(d.name);
    let best = -1;
    let bestScore = 0;
    let tie = false;
    items.forEach((it, i) => {
      const s = overlap(dt, nameTokens(it.name));
      if (s > bestScore) {
        bestScore = s;
        best = i;
        tie = false;
      } else if (s === bestScore && s > 0) {
        tie = true;
      }
    });
    if (best >= 0 && !tie) items[best].discount += d.amount;
    else unmatched.push(d);
  }

  const sumMatch = SUM_RE.exec(lines.map(fixQtyGlyphs).join("\n"));
  const sumFound = sumMatch ? money(sumMatch[1]) : null;
  const sumItems = items.reduce((a, it) => a + it.total, 0);
  const sumDiscounts = discounts.reduce((a, d) => a + d.amount, 0);
  const sumComputed = sumItems - sumDiscounts;
  const sumOk = sumFound !== null && items.length > 0 && sumComputed === sumFound;

  let date = null;
  let time = null;
  for (const line of lines) {
    const dm = DATE_RE.exec(line);
    if (dm) {
      date = `${dm[1]}-${dm[2]}-${dm[3]}`;
      const tm = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(line.slice(dm.index + dm[0].length));
      if (tm) time = `${tm[1]}:${tm[2]}`;
      break;
    }
  }

  const issues = [];
  if (!items.length) {
    issues.push({
      level: "warn",
      text: "Nie znaleziono pozycji. Zrób zdjęcie z bliska, równo, bez cienia i odbłysków, tak żeby paragon wypełniał kadr.",
    });
  } else if (sumFound === null) {
    issues.push({ level: "info", text: "Nie odczytano sumy końcowej, więc nie mogę sprawdzić pozycji. Sprawdź kwoty." });
  } else if (!sumOk) {
    issues.push({
      level: "warn",
      text: `Suma pozycji (${formatMoney(sumComputed)}) nie zgadza się z sumą na paragonie (${formatMoney(sumFound)}). Sprawdź kwoty przy pozycjach.`,
    });
  } else {
    issues.push({ level: "ok", text: `Suma pozycji zgadza się z paragonem (${formatMoney(sumFound)}).` });
  }
  for (const d of unmatched) {
    issues.push({
      level: "warn",
      text: `Opust „${d.name || "bez nazwy"}” (${formatMoney(-d.amount)}) nie został przypisany do pozycji. Wpisz go ręcznie w polu „zapłacono łącznie”.`,
    });
  }
  // Gdy suma się zgadza, urwany napis „opust” to zwykle stopka paragonu, a nie pozycja.
  const strayOpust = sumOk ? 0 : opustWithoutAmount;
  if (strayOpust) {
    issues.push({ level: "warn", text: "Jeden z opustów został odczytany bez kwoty. Sprawdź paragon przy pozycjach z opustem." });
  }
  if (items.some((it) => it.check)) {
    issues.push({ level: "warn", text: "Przy części pozycji ilość razy cena nie daje kwoty z paragonu. Są oznaczone do sprawdzenia." });
  }

  const bad = items.filter((it) => it.check).length + unmatched.length + strayOpust;
  const quality = sumOk ? 3 : sumFound !== null ? 1 : 0;
  return { date, time, items, unmatched, sumFound, sumComputed, sumOk, issues, quality, bad };
}

/** Wybiera lepszy z dwóch odczytów tego samego paragonu. */
export function betterReceipt(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.quality !== b.quality) return a.quality > b.quality ? a : b;
  if (a.bad !== b.bad) return a.bad < b.bad ? a : b;
  return b.items.length > a.items.length ? b : a;
}

function isoDate(d, m, y) {
  const day = parseInt(d, 10);
  const mon = parseInt(m, 10);
  let year = parseInt(y, 10);
  if (y.length === 2) year += 2000;
  if (day < 1 || day > 31 || mon < 1 || mon > 12 || year < 2000 || year > 2100) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Rozbiera tekst z etykiety półkowej: cena (za szt., kg, l), daty ważności, nazwa, minimalna ilość.
 * Duża cena na etykiecie bywa źle czytana, dlatego bierzemy małą linię "39,99 zł/szt".
 */
export function parseLabel(text) {
  const t = String(text || "");
  const priceMatch = new RegExp(String.raw`(${MONEY})\s*z[łl]\s*/\s*(szt|kg|l|opak|m|g|ml)\b`, "i").exec(t);
  const price = priceMatch ? money(priceMatch[1]) : null;
  const unitKind = priceMatch ? priceMatch[2].toLowerCase() : null;

  const dates = [];
  const dateRe = /\b(\d{2})\.(\d{2})\.(\d{4}|\d{2})\b/g;
  let dm;
  while ((dm = dateRe.exec(t)) !== null) {
    const iso = isoDate(dm[1], dm[2], dm[3]);
    if (iso && !dates.includes(iso)) dates.push(iso);
  }
  dates.sort();
  const from = dates.length >= 2 ? dates[0] : null;
  const to = dates.length >= 2 ? dates[dates.length - 1] : null;

  let name = null;
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim();
    const letters = s.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, "");
    if (letters.length < 10) continue;
    const upper = s.replace(/[^A-ZĄĆĘŁŃÓŚŹŻ]/g, "").length;
    if (upper / letters.length < 0.7) continue;
    if (/^cena\b/i.test(s)) continue;
    name = s.replace(/[^\p{L}\p{N}\s./,%-]/gu, "").replace(/\s+/g, " ").trim();
    break;
  }

  const minQtyMatch = /przy\s+zakupie\s+(\d+)\s*szt/i.exec(t);
  const minQty = minQtyMatch ? parseInt(minQtyMatch[1], 10) : null;

  const score = (price !== null ? 4 : 0) + (from ? 2 : 0) + (name ? 1 : 0);
  return { price, unitKind, dates, from, to, name, minQty, score };
}
