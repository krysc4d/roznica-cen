// Logika obliczeń. Wszystkie kwoty w groszach (liczby całkowite),
// żeby uniknąć błędów zaokrągleń typu 0.1 + 0.2.

/** "12,99" lub "12.99" -> 1299. Zwraca null, gdy zapis jest niepoprawny. */
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/\s/g, "").replace(/zł$/i, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const zl = parseInt(m[1], 10);
  const gr = parseInt((m[2] || "").padEnd(2, "0"), 10);
  return zl * 100 + gr;
}

/** 1299 -> "12,99 zł" (z odstępem tysięcy i znakiem minus). */
export function formatMoney(grosze) {
  const sign = grosze < 0 ? "-" : "";
  const abs = Math.abs(grosze);
  const zl = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const gr = String(abs % 100).padStart(2, "0");
  return `${sign}${zl},${gr} zł`;
}

/** Dzielenie całkowite z zaokrągleniem połówek w górę (dla liczb nieujemnych). */
export function roundDiv(a, b) {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Procent z jednym miejscem po przecinku: "12,5" -> 125 (dziesiąte części procenta). */
export function parsePercentTenths(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(",", ".").replace("%", "");
  const m = /^(\d+)(?:\.(\d?))?$/.exec(s);
  if (!m) return null;
  const tenths = parseInt(m[1], 10) * 10 + parseInt((m[2] || "0").padEnd(1, "0"), 10);
  return tenths > 0 && tenths < 1000 ? tenths : null;
}

/** Cena po rabacie procentowym (rabat podany w dziesiątych częściach procenta). */
export function priceAfterPercent(grosze, tenths) {
  return roundDiv(grosze * (1000 - tenths), 1000);
}

/**
 * Ile klient powinien zapłacić za `qty` sztuk według warunków z półki.
 * promo:
 *   { type: "none" }
 *   { type: "multi_price", n, total }   np. 3 za 10 zł
 *   { type: "free", x, y }              np. 2+1 gratis (x płatne, y gratis)
 *   { type: "second_percent", tenths }  np. -50% na drugą sztukę
 *   { type: "percent", tenths }         np. -20% na produkt
 */
export function amountOwed(unit, qty, promo = { type: "none" }) {
  switch (promo.type) {
    case "multi_price": {
      const sets = Math.floor(qty / promo.n);
      return sets * promo.total + (qty % promo.n) * unit;
    }
    case "free": {
      const group = promo.x + promo.y;
      const freeUnits = Math.floor(qty / group) * promo.y;
      return (qty - freeUnits) * unit;
    }
    case "second_percent": {
      const discountedUnits = Math.floor(qty / 2);
      const discountPerUnit = roundDiv(unit * promo.tenths, 1000);
      return qty * unit - discountedUnits * discountPerUnit;
    }
    case "percent":
      return qty * priceAfterPercent(unit, promo.tenths);
    default:
      return qty * unit;
  }
}

/**
 * Oblicza jedną pozycję.
 * item: { qty, shelfUnit, promo, paidUnit, paidTotal }
 *   paidTotal (opcjonalnie) nadpisuje paidUnit * qty, gdy na paragonie są osobne rabaty.
 * Zwraca { ok, error?, owed, paid, payout, status }.
 */
export function computeItem(item) {
  const { qty, shelfUnit, promo, paidUnit, paidTotal } = item;
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: "Podaj ilość (liczba całkowita, min. 1)." };
  if (shelfUnit === null || shelfUnit === undefined) return { ok: false, error: "Podaj cenę z półki." };
  if (paidTotal === null || paidTotal === undefined) {
    if (paidUnit === null || paidUnit === undefined) return { ok: false, error: "Podaj cenę z paragonu." };
  }
  const p = promo || { type: "none" };
  const badPromo =
    (p.type === "multi_price" && !(Number.isInteger(p.n) && p.n >= 2 && Number.isInteger(p.total) && p.total >= 0)) ||
    (p.type === "free" && !(Number.isInteger(p.x) && p.x >= 1 && Number.isInteger(p.y) && p.y >= 1)) ||
    ((p.type === "second_percent" || p.type === "percent") && !(Number.isInteger(p.tenths) && p.tenths > 0 && p.tenths < 1000));
  if (badPromo) return { ok: false, error: "Uzupełnij warunki promocji." };

  const owed = amountOwed(shelfUnit, qty, p);
  const paid = paidTotal !== null && paidTotal !== undefined ? paidTotal : paidUnit * qty;
  const diff = paid - owed;
  const payout = Math.max(0, diff);
  const status = diff > 0 ? "nadplata" : diff === 0 ? "zgodnie" : "mniej";
  return { ok: true, owed, paid, payout, status };
}

/** Suma do wypłaty z listy pozycji. Pozycje z niższą ceną na paragonie nie pomniejszają sumy. */
export function sumPayout(results) {
  return results.reduce((acc, r) => acc + (r && r.ok ? r.payout : 0), 0);
}
