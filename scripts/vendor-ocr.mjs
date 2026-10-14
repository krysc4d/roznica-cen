// Kopiuje pliki OCR (Tesseract) z node_modules do public/vendor/tesseract/,
// żeby aplikacja ładowała je z własnego adresu: bez zewnętrznych serwerów i z pracą offline.
// Uruchamiane ręcznie (npm run vendor) i w workflow przed publikacją. Wynik nie trafia do gita.
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = (p) => path.join(root, "node_modules", p);
const out = path.join(root, "public", "vendor", "tesseract");

const files = [
  // [źródło, cel względem out]
  ["tesseract.js/dist/tesseract.esm.min.js", "tesseract.esm.min.js"],
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  // Rdzeń: biblioteka sama wybiera wariant zależnie od telefonu (SIMD lub bez).
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  // Polski model (wariant best_int: dokładny i mały).
  ["@tesseract.js-data/pol/4.0.0_best_int/pol.traineddata.gz", "lang/pol.traineddata.gz"],
  // Licencje (Apache 2.0) dołączone do kopii.
  ["tesseract.js/LICENSE.md", "LICENSE-tesseract.js.md"],
  ["tesseract.js-core/LICENSE", "LICENSE-tesseract.js-core.txt"],
];

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });

for (const [src, dst] of files) {
  const from = nm(src);
  if (!existsSync(from)) {
    console.error(`Brak pliku: ${from}. Uruchom najpierw: npm ci`);
    process.exit(1);
  }
  cpSync(from, path.join(out, dst));
  console.log(`ok ${dst}`);
}
