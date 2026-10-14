# Różnica cen

Prywatny kalkulator na telefon do liczenia różnic między ceną z półki a ceną z paragonu.
To aplikacja webowa (PWA): jeden zestaw plików statycznych, bez serwera, bez logowania,
działa offline po pierwszym otwarciu. Dane zostają w telefonie.

## Co liczy (wersja 0.1)

- Różnica półka kontra paragon razy ilość, osobno dla każdej pozycji.
- Promocje wielosztukowe zależne od ilości:
  - N sztuk za Z zł (np. 3 za 10 zł),
  - X+Y gratis (np. 2+1),
  - rabat procentowy na drugą sztukę,
  - rabat procentowy na produkt.
- Opcja "zapłacono łącznie", gdy na paragonie są osobne linie rabatów.
- Lista pozycji z sumą do wypłaty. Pozycje, gdzie na paragonie było taniej niż na półce, nie pomniejszają sumy.

Wszystkie kwoty liczone są w groszach (liczby całkowite), więc nie ma błędów zaokrągleń.
Połówki groszy zaokrąglane są w górę. Rabat procentowy na produkt liczony jest od ceny za sztukę
(jak cena po rabacie na etykiecie), a potem mnożony przez ilość.

## Struktura projektu

```
public/               to jest publikowane na GitHub Pages
  index.html          interfejs
  css/style.css       style (jasny i ciemny motyw, duże pola dotykowe)
  js/calc.js          cała logika obliczeń, bez dostępu do przeglądarki
  js/app.js           obsługa formularza i listy
  sw.js               service worker (praca offline)
  manifest.webmanifest
  icons/
test/calc.test.js     testy logiki (node:test)
.github/workflows/    testy i publikacja na GitHub Pages
```

Zasada: nowe reguły liczenia dodajemy w `public/js/calc.js` razem z testem w `test/calc.test.js`.
Interfejs tylko wywołuje te funkcje.

## Uruchomienie lokalne

```bash
npm test          # testy logiki (wymaga Node 20 lub nowszego, bez instalowania paczek)
npm run serve     # podgląd na http://localhost:8080
```

## Publikacja na GitHub Pages

1. Utwórz repozytorium na GitHubie (może być prywatne, jeśli plan pozwala na Pages, inaczej publiczne).
2. Wypchnij kod na gałąź `main`.
3. W repozytorium: Settings, Pages, Source: **GitHub Actions**.
4. Workflow `Testy i publikacja na GitHub Pages` uruchomi testy i opublikuje folder `public/`.
   Adres będzie w postaci `https://<login>.github.io/<nazwa-repozytorium>/`.

Przy każdej zmianie plików w `public/` podbij numer wersji w `public/sw.js` (`CACHE`),
żeby telefon pobrał nową wersję zamiast starej z pamięci.

## Instalacja na Androidzie

1. Otwórz adres strony w Chrome.
2. Menu (trzy kropki), "Dodaj do ekranu głównego" lub "Zainstaluj aplikację".
3. Po pierwszym otwarciu z internetem aplikacja działa także bez zasięgu.

## Granice użycia

- Narzędzie jest prywatne i pomocnicze. O wypłacie rozstrzyga system i zasady sklepu.
- Nie wpisuj danych klientów (nazwisk, numerów kart, telefonów).
- Nie przepisuj ani nie kopiuj tu danych z wewnętrznych systemów i baz cen firmy.
- Pole "Produkt lub EAN" jest opcjonalne i służy tylko do rozpoznania pozycji na liście.
- Lista zapisuje się lokalnie w przeglądarce telefonu. Przycisk "Wyczyść listę" usuwa ją.
- Dobrze krótko uzgodnić z przełożonym używanie prywatnego telefonu przy obsłudze reklamacji.

## Plan rozwoju

- Wersja 0.2: skan kodu EAN w przeglądarce (BarcodeDetector w Chrome na Androidzie) jako szybkie rozpoznanie produktu.
- Później: odczyt pozycji ze zdjęcia paragonu (OCR) po teście na kilku paragonach bez danych klientów.
- Nie planujemy automatycznego pobierania cen ze strony sklepu.
