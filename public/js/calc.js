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

/** 1299 -> "12,99" (do wpisania w pole formularza, bez waluty). */
export function moneyInputValue(grosze) {
  const abs = Math.abs(grosze);
  return `${grosze < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** 1299 -> "12,99 zł" (z odstępem tysięcy i znakiem minus). */
export function formatMoney(grosze) {
  const sign = grosze < 0 ? "-" : "";
  const abs = Math.abs(grosze);
  const zl = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const gr = String(abs % 100).padStart(2, "0");
  return `${sign}${zl},${gr} zł`;
}

/** "1,094" lub "3" -> tysięczne części (1094 lub 3000). Do 3 miejsc po przecinku, null gdy niepoprawne. */
export function parseQtyMilli(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(",", ".").replace(/\s*(kg|szt\.?)$/i, "");
  const m = /^(\d+)(?:\.(\d{0,3}))?$/.exec(s);
  if (!m) return null;
  const milli = parseInt(m[1], 10) * 1000 + parseInt((m[2] || "").padEnd(3, "0"), 10);
  return milli > 0 ? milli : null;
}

/** 1094 -> "1,094", 3000 -> "3" (bez zbędnych zer). */
export function formatQty(qtyMilli) {
  const whole = Math.floor(qtyMilli / 1000);
  const frac = String(qtyMilli % 1000).padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole},${frac}` : String(whole);
}

/**
 * Sprawdza, czy data zakupu mieści się w okresie ważności ceny z półki.
 * Daty w formacie RRRR-MM-DD (porównanie tekstowe jest poprawne dla tego formatu).
 * Zwraca "ok", "przed", "po" albo null, gdy brakuje danych.
 */
export function checkValidity(purchase, from, to) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(purchase || "")) return null;
  if (!iso.test(from || "") && !iso.test(to || "")) return null;
  if (iso.test(from || "") && purchase < from) return "przed";
  if (iso.test(to || "") && purchase > to) return "po";
  return "ok";
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
  const { shelfUnit, promo, paidUnit, paidTotal } = item;
  // Ilość: qtyMilli (tysięczne części, np. 1,094 kg = 1094) albo qty (sztuki, liczba całkowita).
  let qtyMilli;
  if (item.qtyMilli !== undefined && item.qtyMilli !== null) {
    qtyMilli = item.qtyMilli;
  } else if (Number.isInteger(item.qty)) {
    qtyMilli = item.qty * 1000;
  } else {
    return { ok: false, error: "Podaj ilość (np. 2 albo 1,094 dla wagi)." };
  }
  if (!Number.isInteger(qtyMilli) || qtyMilli < 1) return { ok: false, error: "Podaj ilość (np. 2 albo 1,094 dla wagi)." };
  const isWeight = qtyMilli % 1000 !== 0;
  const qty = qtyMilli / 1000;
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

  if (isWeight && p.type !== "none" && p.type !== "percent") {
    return { ok: false, error: "Ta promocja dotyczy sztuk (liczba całkowita). Dla wagi wybierz brak promocji albo rabat %." };
  }

  let owed;
  let paid;
  if (isWeight) {
    const unitAfter = p.type === "percent" ? priceAfterPercent(shelfUnit, p.tenths) : shelfUnit;
    owed = roundDiv(qtyMilli * unitAfter, 1000);
    paid = paidTotal !== null && paidTotal !== undefined ? paidTotal : roundDiv(qtyMilli * paidUnit, 1000);
  } else {
    owed = amountOwed(shelfUnit, qty, p);
    paid = paidTotal !== null && paidTotal !== undefined ? paidTotal : paidUnit * qty;
  }
  const diff = paid - owed;
  const payout = Math.max(0, diff);
  const status = diff > 0 ? "nadplata" : diff === 0 ? "zgodnie" : "mniej";
  return { ok: true, owed, paid, payout, status, qtyMilli };
}

/** Suma do wypłaty z listy pozycji. Pozycje z niższą ceną na paragonie nie pomniejszają sumy. */
export function sumPayout(results) {
  return results.reduce((acc, r) => acc + (r && r.ok ? r.payout : 0), 0);
}
