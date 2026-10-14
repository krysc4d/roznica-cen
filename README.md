# Różnica cen

Prywatny kalkulator na telefon do liczenia różnic między ceną z półki a ceną z paragonu.
To aplikacja webowa (PWA): jeden zestaw plików statycznych, bez serwera, bez logowania,
działa offline po pierwszym otwarciu. Dane zostają w telefonie.

## Co liczy (wersja 0.2)

- Różnica półka kontra paragon razy ilość, osobno dla każdej pozycji.
- Promocje wielosztukowe zależne od ilości:
  - N sztuk za Z zł (np. 3 za 10 zł),
  - X+Y gratis (np. 2+1),
  - rabat procentowy na drugą sztukę,
  - rabat procentowy na produkt.
- Opcja "zapłacono łącznie", gdy na paragonie są osobne linie rabatów.
- Towar na wagę: ilość ułamkowa w kg (np. 1,094), kwota liczona jak na paragonie (zaokrąglenie do grosza).
  Promocje wielosztukowe są dla wagi wyłączone, rabat procentowy działa.
- Data zakupu kontra okres ważności ceny z półki, z ostrzeżeniem, gdy zakup był poza okresem.
- Lista pozycji z sumą do wypłaty. Pozycje, gdzie na paragonie było taniej niż na półce, nie pomniejszają sumy.

## Zdjęcia: paragon i etykieta (OCR)

- **Paragon:** przycisk "Zrób zdjęcie paragonu" odczytuje pozycje (ilość x cena = kwota), opusty, datę i sumę.
  Dotknięcie pozycji wypełnia formularz (nazwa, ilość, cena z paragonu, kwota po opuście, data zakupu).
  Zostaje tylko dopisać cenę z półki.
- **Etykieta półkowa:** przycisk "Zdjęcie etykiety z półki" wycina żółtą etykietę i odczytuje cenę
  oraz daty ważności.
- **Kontrola:** suma pozycji (minus opusty) jest porównywana z sumą na paragonie. Gdy się nie zgadza,
  aplikacja próbuje drugi raz z inną obróbką zdjęcia, a jeśli nadal nie, pokazuje ostrzeżenie.
  Pozycje z niezgodnym iloczynem są oznaczone. Wszystko trafia do formularza do sprawdzenia przez człowieka.
- **Prywatność:** odczyt działa w samym telefonie (Tesseract, WebAssembly). Zdjęcia nie są wysyłane
  ani zapisywane. Pierwsze użycie pobiera jednorazowo około 7 MB (silnik i słownik polski),
  potem działa też bez internetu. Z paragonu zapisują się tylko nazwy towarów i kwoty
  (bez numeru karty, kasjera i numeru transakcji).
- **Ograniczenia:** nazwy pozycji bywają z szumem na początku (są do poprawienia w formularzu).
  Najlepiej fotografować z bliska, równo, bez cienia i odbłysków.
- Silnik odczytu nie jest w repozytorium: `npm ci && npm run vendor` kopiuje go do `public/vendor/`
  (to robi też workflow przed publikacją). Bez tego aplikacja działa, tylko bez przycisków do zdjęć.

Wszystkie kwoty liczone są w groszach (liczby całkowite), więc nie ma błędów zaokrągleń.
Połówki groszy zaokrąglane są w górę. Rabat procentowy na produkt liczony jest od ceny za sztukę
(jak cena po rabacie na etykiecie), a potem mnożony przez ilość.

## Struktura projektu

```
public/               to jest publikowane na GitHub Pages
  index.html          interfejs
  css/style.css       style (jasny i ciemny motyw, duże pola dotykowe)
  js/calc.js          cała logika obliczeń, bez dostępu do przeglądarki
  js/receipt.js       rozbiór tekstu z paragonu i etykiety (czysta logika)
  js/ocr.js           odczyt tekstu ze zdjęcia (Tesseract w przeglądarce)
  js/scan.js          skanowanie z ponowną próbą i kontrolą sumy
  js/app.js           obsługa formularza, listy i zdjęć
  vendor/             silnik OCR (tworzony przez npm run vendor, nie w gicie)
  sw.js               service worker (praca offline)
  manifest.webmanifest
  icons/
scripts/              kopiowanie silnika OCR, budowa artefaktu
test/                 testy logiki i parserów, fixtures to skrócone odczyty bez danych osobowych
.github/workflows/    testy i publikacja na GitHub Pages
```

Zasada: nowe reguły liczenia dodajemy w `public/js/calc.js` razem z testem w `test/calc.test.js`.
Interfejs tylko wywołuje te funkcje.

## Uruchomienie lokalne

```bash
npm ci            # raz: instaluje silnik OCR (Node 20 lub nowszy)
npm run vendor    # raz: kopiuje go do public/vendor/ (potrzebne do zdjęć)
npm test          # testy
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

Zobacz `TODO.md`. Najbliżej: test PaddleOCR + PP-Structure jako możliwej poprawy odczytu,
skan kodu EAN, eksport listy do CSV.
Nie planujemy automatycznego pobierania cen ze strony sklepu.
