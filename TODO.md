# Do zrobienia (kolejne wersje)

## Silnik OCR: sprawdzić PaddleOCR + PP-Structure zamiast Tesseract

Pomysł od Krystiana (14.10.2026). Nie robimy teraz, najpierw testy porównawcze.

- Cel: lepszy odczyt paragonów (mały druk termiczny, blade tło) i etykiet półkowych bez ręcznego przycinania.
- PP-Structure rozpoznaje układ strony i tabele, co może pomóc przy kolumnach ilość x cena = kwota.
- Do sprawdzenia przed decyzją:
  - czy model rozpoznawania łacińskiego dobrze czyta polskie znaki (ą ć ę ł ń ó ś ź ż),
  - czy da się go uruchomić w samej przeglądarce (ONNX Runtime Web / WebAssembly), bo zdjęcia nie mogą wychodzić z telefonu,
  - rozmiar modeli do pobrania i czas odczytu na przeciętnym telefonie z Androidem (dziś Tesseract: około 7 MB, około 4 s na paragon),
  - czy działa offline po pierwszym pobraniu.
- Jak porównać uczciwie: te same zdjęcia (paragon a/b/c, etykieta a/b) i te same wskaźniki: liczba poprawnie odczytanych pozycji, zgodność sumy z paragonem, czas, rozmiar.
- Warunek wdrożenia: wynik wyraźnie lepszy niż Tesseract na naszych zdjęciach. Parser (`receipt.js`) i kontrola sumy zostają bez zmian, wymieniamy tylko `ocr.js`.

### Wyniki pierwszego testu (14.10.2026, jedno zdjęcie paragonu i jedna etykieta)

Test: PP-OCR v3 (model chińsko-angielski z paczki `rapidocr-onnxruntime`, ONNX) kontra Tesseract 7 (polski).
Modeli łacińskich i PP-Structure nie dało się pobrać (hosty Baidu, Hugging Face i ModelScope są w tym środowisku zablokowane).

| | Tesseract (w przeglądarce) | PP-OCR v3 (Python, serwer) |
|---|---|---|
| Pozycje z paragonu | 10 z 10, suma 108,63 zgodna | 10 z 10, suma zgodna, ale tylko z tolerancyjnym parserem |
| Nazwy | z szumem („SKA COC UDO”, „NESKA”) | czyste („MC UDO Z KURCZAKA”, „TEX KOSZULA MESKA”) |
| Przecinki w kwotach | poprawne | gubi je (np. „1355” zamiast „13,55”, „=” jako „-”) |
| Polskie litery | tak | nie (model bez ą ć ę ł ń ś ź ż, np. „tOSOSIOWA”) |
| Czas | około 4,7 s | około 2 s (to inny sprzęt, na telefonie nieznany) |
| Etykieta (bez wycinania) | cena i daty po wycięciu żółtej etykiety | nazwa czysta, cena i daty sklejone („05.10.2617.10.26”) |

Wnioski:
- Paddle czyta nazwy wyraźnie lepiej, ale potrzebuje parsera, który dobiera brakujące przecinki tak, żeby ilość x cena = kwota.
  Prototyp tego parsera działał (10 z 10 i zgodna suma), ale tylko na jednym zdjęciu.
- Wynik zależy od skali zdjęcia (1x, 1,5x i 2x dały różne odczyty), więc potrzeba więcej zdjęć.
- Uruchomienie w telefonie wymaga własnej obróbki (wykrywanie tekstu DB i rozpoznawanie CTC na onnxruntime-web).
  Rozmiar: modele około 13 MB plus onnxruntime-web.
- Brakuje modelu łacińskiego z polskimi znakami. Trzeba go zdobyć z dozwolonego źródła albo pobrać ręcznie.
- Decyzja: nie przełączamy się teraz. Następny krok to 10 do 20 prawdziwych paragonów z aparatu (bez danych osobowych) i uczciwe porównanie.

## Pozostałe pomysły

- Skanowanie kodu kreskowego (EAN) zamiast wpisywania nazwy.
- Zapamiętywanie ostatnio używanych promocji.
- Eksport listy wypłat do pliku (CSV) na koniec zmiany.
