// Skanowanie zdjęć: łączy odczyt tekstu (ocr.js) z rozbiorem (receipt.js).
// Strategia: pierwsze podejście jest szybkie; drugie (z rozciągnięciem kontrastu) tylko, gdy suma się nie zgadza.

import { readText } from "./ocr.js";
import { parseReceipt, betterReceipt, parseLabel } from "./receipt.js";

/** Paragon: do dwóch podejść, zatrzymuje się, gdy suma pozycji zgadza się z sumą na paragonie. */
export async function scanReceipt(file, onStatus) {
  const first = parseReceipt(await readText(file, { mode: "receipt", psm: "6", onStatus }));
  if (first.sumOk) return first;
  if (onStatus) onStatus("Suma się nie zgadza, próbuję drugi raz");
  const second = parseReceipt(
    await readText(file, { mode: "receipt", psm: "6", prepare: { stretch: true }, onStatus })
  );
  return betterReceipt(first, second);
}

/** Etykieta półkowa: najpierw wycięcie żółtej etykiety i szukanie rozrzuconego tekstu, potem układ blokowy. */
export async function scanLabel(file, onStatus) {
  const first = parseLabel(
    await readText(file, { mode: "label", psm: "11", prepare: { cropYellow: true }, onStatus })
  );
  if (first.price !== null) return first;
  if (onStatus) onStatus("Nie widzę ceny, próbuję drugi raz");
  const second = parseLabel(
    await readText(file, { mode: "label", psm: "6", prepare: { cropYellow: true, stretch: true }, onStatus })
  );
  return second.score > first.score ? second : first;
}
