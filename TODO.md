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

## Pozostałe pomysły

- Skanowanie kodu kreskowego (EAN) zamiast wpisywania nazwy.
- Zapamiętywanie ostatnio używanych promocji.
- Eksport listy wypłat do pliku (CSV) na koniec zmiany.
