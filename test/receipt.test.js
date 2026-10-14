import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReceipt, betterReceipt, parseLabel, cleanName } from "../public/js/receipt.js";

// Fixtures to skrócone teksty z prawdziwych odczytów OCR (bez adresu, numerów i danych kasjera).
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("paragon: 10 pozycji, suma zgodna, data i godzina", () => {
  const r = parseReceipt(fx("paragon-a.txt"));
  assert.equal(r.items.length, 10);
  assert.equal(r.sumFound, 10863);
  assert.equal(r.sumComputed, 10863);
  assert.equal(r.sumOk, true);
  assert.equal(r.date, "2026-10-14");
  assert.equal(r.time, "15:15");
  assert.equal(r.bad, 0, "urwany napis „opust” ze stopki nie psuje oceny, gdy suma się zgadza");
});

test("paragon: waga, mnożenie gwiazdką, jedynka czytana jako i", () => {
  const r = parseReceipt(fx("paragon-a.txt"));
  const udo = r.items.find((i) => /UDO/.test(i.name));
  assert.deepEqual([udo.qtyMilli, udo.unit, udo.total], [1094, 1239, 1355]);
  const sliwka = r.items.find((i) => /LUZ/.test(i.name));
  assert.deepEqual([sliwka.qtyMilli, sliwka.unit, sliwka.total], [866, 699, 605]);
  const kefir = r.items.find((i) => /KEFIR/.test(i.name));
  assert.deepEqual([kefir.qtyMilli, kefir.unit, kefir.total], [1000, 289, 289]);
});

test("paragon: opusty przypisane do właściwych pozycji", () => {
  const r = parseReceipt(fx("paragon-a.txt"));
  assert.equal(r.items.find((i) => /UDO/.test(i.name)).discount, 481);
  assert.equal(r.items.find((i) => /LUZ/.test(i.name)).discount, 173);
  assert.equal(r.items.filter((i) => i.discount).length, 2);
  assert.equal(r.unmatched.length, 0);
});

test("paragon: błędnie odczytana suma jest wychwycona", () => {
  const r = parseReceipt(fx("paragon-zla-suma.txt"));
  assert.equal(r.items.length, 10);
  assert.equal(r.sumFound, 10663);
  assert.equal(r.sumOk, false);
  assert.ok(r.issues.some((i) => i.level === "warn" && /nie zgadza/.test(i.text)));
});

test("paragon: opust bez kwoty przy niezgodnej sumie jest ostrzeżeniem", () => {
  const r = parseReceipt(fx("paragon-zla-suma.txt"));
  assert.ok(r.issues.some((i) => /bez kwoty/.test(i.text)));
});

test("paragon: naprawa pojedynczej pomyłki w cenie jednostkowej", () => {
  const r = parseReceipt("MASLO 1,500x7,20= 10,94 C\nSUMA PLN 10,94");
  assert.equal(r.items[0].unit, 729);
  assert.equal(r.items[0].repaired, true);
  assert.equal(r.sumOk, true);
});

test("paragon: puste zdjęcie daje ostrzeżenie, nie błąd", () => {
  const r = parseReceipt("");
  assert.equal(r.items.length, 0);
  assert.equal(r.sumOk, false);
  assert.equal(r.issues[0].level, "warn");
});

test("betterReceipt wybiera odczyt z zgodną sumą", () => {
  const good = parseReceipt(fx("paragon-a.txt"));
  const bad = parseReceipt(fx("paragon-zla-suma.txt"));
  assert.equal(betterReceipt(bad, good), good);
  assert.equal(betterReceipt(good, bad), good);
  assert.equal(betterReceipt(null, bad), bad);
});

test("cleanName usuwa śmieci z początku i literę PTU", () => {
  assert.equal(cleanName("Szarej C_KEFIR LUKSUS.420G"), "KEFIR LUKSUS.420G");
});

test("etykieta: cena, daty, nazwa, minimalna ilość", () => {
  const l = parseLabel(fx("etykieta.txt"));
  assert.equal(l.price, 3999);
  assert.equal(l.unitKind, "szt");
  assert.equal(l.from, "2026-10-05");
  assert.equal(l.to, "2026-10-17");
  assert.match(l.name, /TEX KOSZULA/);
  assert.equal(l.minQty, 1);
});

test("etykieta: brak ceny gdy nie da się odczytać", () => {
  const l = parseLabel("coś nieczytelnego\n39 99");
  assert.equal(l.price, null);
  assert.equal(l.from, null);
});
