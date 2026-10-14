import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  formatMoney,
  parseQtyMilli,
  formatQty,
  checkValidity,
  parsePercentTenths,
  priceAfterPercent,
  amountOwed,
  computeItem,
  sumPayout,
} from "../public/js/calc.js";

test("parseMoney: przecinek, kropka, spacje, zł", () => {
  assert.equal(parseMoney("12,99"), 1299);
  assert.equal(parseMoney("12.99"), 1299);
  assert.equal(parseMoney(" 3 zł "), 300);
  assert.equal(parseMoney("0,5"), 50);
  assert.equal(parseMoney("7"), 700);
});

test("parseMoney: niepoprawne wartości", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney("1,999"), null);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parseMoney(null), null);
});

test("formatMoney", () => {
  assert.equal(formatMoney(1299), "12,99 zł");
  assert.equal(formatMoney(5), "0,05 zł");
  assert.equal(formatMoney(123456), "1 234,56 zł");
  assert.equal(formatMoney(-250), "-2,50 zł");
});

test("parsePercentTenths", () => {
  assert.equal(parsePercentTenths("50"), 500);
  assert.equal(parsePercentTenths("12,5"), 125);
  assert.equal(parsePercentTenths("20%"), 200);
  assert.equal(parsePercentTenths("0"), null);
  assert.equal(parsePercentTenths("100"), null);
  assert.equal(parsePercentTenths("x"), null);
});

test("priceAfterPercent zaokrągla połówki w górę", () => {
  assert.equal(priceAfterPercent(999, 200), 799); // 9,99 * 0,8 = 7,992
  assert.equal(priceAfterPercent(1000, 200), 800);
  assert.equal(priceAfterPercent(1, 500), 1); // 0,5 gr -> 1 gr
});

test("amountOwed: bez promocji", () => {
  assert.equal(amountOwed(499, 3), 1497);
});

test("amountOwed: 3 za 10 zł", () => {
  const promo = { type: "multi_price", n: 3, total: 1000 };
  assert.equal(amountOwed(399, 3, promo), 1000);
  assert.equal(amountOwed(399, 4, promo), 1399);
  assert.equal(amountOwed(399, 2, promo), 798);
  assert.equal(amountOwed(399, 6, promo), 2000);
});

test("amountOwed: 2+1 gratis", () => {
  const promo = { type: "free", x: 2, y: 1 };
  assert.equal(amountOwed(500, 3, promo), 1000);
  assert.equal(amountOwed(500, 2, promo), 1000);
  assert.equal(amountOwed(500, 4, promo), 1500);
  assert.equal(amountOwed(500, 6, promo), 2000);
});

test("amountOwed: -50% na drugą sztukę", () => {
  const promo = { type: "second_percent", tenths: 500 };
  assert.equal(amountOwed(1000, 1, promo), 1000);
  assert.equal(amountOwed(1000, 2, promo), 1500);
  assert.equal(amountOwed(1000, 3, promo), 2500);
  assert.equal(amountOwed(1000, 4, promo), 3000);
});

test("amountOwed: -20% na produkt (cena po rabacie liczona za sztukę)", () => {
  const promo = { type: "percent", tenths: 200 };
  assert.equal(amountOwed(999, 2, promo), 1598); // 2 * 7,99
});

test("computeItem: klasyczna różnica półka vs paragon", () => {
  const r = computeItem({ qty: 2, shelfUnit: 499, promo: { type: "none" }, paidUnit: 549 });
  assert.equal(r.ok, true);
  assert.equal(r.owed, 998);
  assert.equal(r.paid, 1098);
  assert.equal(r.payout, 100);
  assert.equal(r.status, "nadplata");
});

test("computeItem: zgodne ceny", () => {
  const r = computeItem({ qty: 1, shelfUnit: 499, promo: { type: "none" }, paidUnit: 499 });
  assert.equal(r.payout, 0);
  assert.equal(r.status, "zgodnie");
});

test("computeItem: na paragonie taniej niż na półce, wypłata 0", () => {
  const r = computeItem({ qty: 1, shelfUnit: 499, promo: { type: "none" }, paidUnit: 449 });
  assert.equal(r.payout, 0);
  assert.equal(r.status, "mniej");
});

test("computeItem: promocja 3 za 10 zł, klient zapłacił cenę regularną", () => {
  const r = computeItem({
    qty: 3,
    shelfUnit: 399,
    promo: { type: "multi_price", n: 3, total: 1000 },
    paidUnit: 399,
  });
  assert.equal(r.owed, 1000);
  assert.equal(r.paid, 1197);
  assert.equal(r.payout, 197);
});

test("computeItem: paidTotal nadpisuje cenę za sztukę", () => {
  const r = computeItem({
    qty: 2,
    shelfUnit: 500,
    promo: { type: "none" },
    paidUnit: 600,
    paidTotal: 1150,
  });
  assert.equal(r.paid, 1150);
  assert.equal(r.payout, 150);
});

test("computeItem: walidacja", () => {
  assert.equal(computeItem({ qty: 0, shelfUnit: 100, paidUnit: 100 }).ok, false);
  assert.equal(computeItem({ qty: 1.5, shelfUnit: 100, paidUnit: 100 }).ok, false);
  assert.equal(computeItem({ qty: 1, shelfUnit: null, paidUnit: 100 }).ok, false);
  assert.equal(computeItem({ qty: 1, shelfUnit: 100, paidUnit: null }).ok, false);
  assert.equal(
    computeItem({ qty: 1, shelfUnit: 100, paidUnit: 100, promo: { type: "multi_price", n: 1, total: 100 } }).ok,
    false
  );
});

test("sumPayout: pozycje z niższą ceną nie pomniejszają sumy", () => {
  const a = computeItem({ qty: 1, shelfUnit: 500, paidUnit: 600 }); // 100
  const b = computeItem({ qty: 1, shelfUnit: 500, paidUnit: 400 }); // 0
  const c = computeItem({ qty: 2, shelfUnit: 250, paidUnit: 300 }); // 100
  assert.equal(sumPayout([a, b, c, { ok: false }]), 200);
});

test("brak błędów zmiennoprzecinkowych", () => {
  // klasyczny przykład: 0,1 + 0,2
  const r = computeItem({ qty: 3, shelfUnit: 10, paidUnit: 20 }); // 0,10 vs 0,20
  assert.equal(r.payout, 30);
});

test("parseQtyMilli i formatQty", () => {
  assert.equal(parseQtyMilli("1,094"), 1094);
  assert.equal(parseQtyMilli("3"), 3000);
  assert.equal(parseQtyMilli("0,5 kg"), 500);
  assert.equal(parseQtyMilli("0,164"), 164);
  assert.equal(parseQtyMilli("1,0945"), null);
  assert.equal(parseQtyMilli("0"), null);
  assert.equal(parseQtyMilli("abc"), null);
  assert.equal(formatQty(1094), "1,094");
  assert.equal(formatQty(3000), "3");
  assert.equal(formatQty(500), "0,5");
});

test("waga: pozycje z prawdziwego paragonu (kwoty zgodne z paragonem)", () => {
  // udo z kurczaka 1,094 kg po 12,39 = 13,55
  const udo = computeItem({ qtyMilli: 1094, shelfUnit: 1239, paidUnit: 1239 });
  assert.equal(udo.paid, 1355);
  assert.equal(udo.owed, 1355);
  // śliwka 0,866 kg po 6,99 = 6,05
  assert.equal(computeItem({ qtyMilli: 866, shelfUnit: 699, paidUnit: 699 }).paid, 605);
  // metka łososiowa 0,164 kg po 34,49 = 5,66
  assert.equal(computeItem({ qtyMilli: 164, shelfUnit: 3449, paidUnit: 3449 }).paid, 566);
});

test("waga: różnica ceny za kg", () => {
  // na paragonie 12,39/kg, na półce 9,99/kg, 1,094 kg
  const r = computeItem({ qtyMilli: 1094, shelfUnit: 999, paidUnit: 1239 });
  assert.equal(r.owed, 1093); // 1,094 * 9,99 = 10,93
  assert.equal(r.paid, 1355);
  assert.equal(r.payout, 262);
});

test("waga: opust z paragonu przez paidTotal", () => {
  // udo: 13,55 minus opust 4,81 = 8,74 zapłacone; po półkowej cenie 12,39 należało 13,55
  const r = computeItem({ qtyMilli: 1094, shelfUnit: 1239, paidUnit: 1239, paidTotal: 874 });
  assert.equal(r.paid, 874);
  assert.equal(r.payout, 0);
});

test("waga: promocje wielosztukowe są odrzucone, rabat % działa", () => {
  const bad = computeItem({ qtyMilli: 1500, shelfUnit: 1000, paidUnit: 1000, promo: { type: "free", x: 2, y: 1 } });
  assert.equal(bad.ok, false);
  const pct = computeItem({ qtyMilli: 1500, shelfUnit: 1000, paidUnit: 1000, promo: { type: "percent", tenths: 200 } });
  assert.equal(pct.ok, true);
  assert.equal(pct.owed, 1200); // 1,5 kg po 8,00
});

test("qtyMilli całkowite działa jak sztuki", () => {
  const a = computeItem({ qtyMilli: 3000, shelfUnit: 399, paidUnit: 399, promo: { type: "multi_price", n: 3, total: 1000 } });
  assert.equal(a.owed, 1000);
  assert.equal(a.payout, 197);
});

test("checkValidity", () => {
  assert.equal(checkValidity("2026-10-14", "2026-10-05", "2026-10-17"), "ok");
  assert.equal(checkValidity("2026-10-04", "2026-10-05", "2026-10-17"), "przed");
  assert.equal(checkValidity("2026-10-18", "2026-10-05", "2026-10-17"), "po");
  assert.equal(checkValidity("2026-10-14", "", "2026-10-17"), "ok");
  assert.equal(checkValidity("", "2026-10-05", "2026-10-17"), null);
  assert.equal(checkValidity("2026-10-14", "", ""), null);
});
