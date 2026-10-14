// Składa pojedynczy plik HTML (CSS i JS wstawione do środka) do publikacji jako artefakt Claude.
// Źródłem prawdy zostają pliki w public/. Wynik: dist/artifact.html (nie trafia do gita).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");

// CSS bez linii oznaczonych "repo-only" (marginesy bezpieczne dostarcza szkielet artefaktu).
const css = read("css/style.css")
  .split("\n")
  .filter((line) => !line.includes("repo-only"))
  .join("\n");

// JS: calc.js bez "export", app.js bez importu i bez rejestracji service workera.
const calc = read("js/calc.js").replace(/^export /gm, "");
let app = read("js/app.js")
  .replace(/import \{[\s\S]*?\} from "\.\/calc\.js";\n/, "")
  .replace(/if \("serviceWorker" in navigator\) \{[\s\S]*$/, "");

const body = read("index.html")
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module" src="js\/app\.js"><\/script>/, "")
  .trim();

const html = `<title>Różnica cen</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
${body}
<script>
(() => {
${calc}
${app}
})();
</script>
`;

mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/artifact.html", import.meta.url), html);
console.log(`dist/artifact.html: ${html.length} znaków`);
