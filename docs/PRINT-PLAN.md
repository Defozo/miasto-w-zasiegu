# Wydruk planu na drogę

Przycisk „Wydrukuj plan” otwiera systemowe okno drukowania przeglądarki. Można wybrać papier albo dostępny w systemie zapis do PDF. Aplikacja nie wysyła pliku do drukarki ani nie potwierdza, że fizyczny wydruk został wykonany.

## Zawartość

Wydruk zawiera start, kolejne przystanki i cel, długość, szacowany czas, potrzeby użyte do obliczenia trasy, instrukcje oraz ostrzeżenia silnika tras. Zachowuje pełne adresy, polskie znaki i kolejność przystanków. Położenia przybliżone mają osobną uwagę, że punkt nie potwierdza wejścia. Gdy brak etykiety adresu, dostępne współrzędne pochodzą z punktu lub końca geometrii trasy.

Data obliczenia pochodzi wyłącznie z `route.source.computedAt` i jest podawana z rokiem, w strefie `Europe/Warsaw`. Brak daty jest jawny. Wydruk nie zastępuje jej chwilą drukowania ani datą zapisania planu. Otwarty zapis otrzymuje informację, że trasa nie została ponownie przeliczona, i pokazuje potrzeby z tego zapisu.

Papier jest zapasem do przeglądania. Nie ma lokalizacji GPS, bieżących zgłoszeń ani potwierdzenia przejezdności całej drogi. Informacja o brakach pomiarów pozostaje widoczna przed instrukcjami.

## Integracja i prywatność

`PrintPlan` przyjmuje `route`, `start`, `end`, `via`, `profile` i `viewingSaved`. Rodzic montuje go wyłącznie przy aktualnie widocznej, uprawnionej trasie. Przy odtworzonym planie przekazuje `saved.profile`, a nie bieżący profil. Komponent nie odczytuje sesji, localStorage ani katalogu zapisów i nie przechowuje własnej kopii danych.

Dokument jest portalem bezpośrednio w `body`. Na ekranie ma `display: none`; reguły `@media print` pokazują go i ukrywają resztę aplikacji tylko wtedy, gdy portal istnieje. Nie drukują formularzy, konta, gry ani interaktywnej mapy. Odmontowanie trasy usuwa również portal, więc zablokowany zapis nie pozostaje w niewidocznym DOM.

Wydruk i zapisany przez użytkownika PDF zawierają adresy oraz wybrane potrzeby. Już utworzonej kopii poza aplikacją nie można odwołać przez wylogowanie. Przeglądarka może dodać własne nagłówki i stopki, zgodnie z ustawieniami okna drukowania.

## Układ i sprawdzenie

Format domyślny to A4 z marginesami. Ciemny tekst na białym tle, obramowania i oznaczenia literowe nie wymagają drukowania kolorowych teł. Poszczególne instrukcje, punkty i podsumowania mają `break-inside: avoid-page`; długie adresy zawijają się. Komponent nie otwiera dodatkowego modala. Przycisk działa z klawiatury i wywołuje `window.print()` bezpośrednio z gestu użytkownika.

`tests/e2e/print-plan.spec.ts` obejmuje ekran i emulację druku, wywołanie drukowania klawiaturą, długie adresy, dwa przystanki, wielostronicowy PDF, datę i potrzeby starszego planu oraz usunięcie wydruku po zablokowaniu prywatnego zapisu. Dane wydruku w pierwszym scenariuszu są kontrolowanymi przykładami testowymi. Testy nie używają fizycznej drukarki ani płatnych wyszukiwań.

Układ PDF, polskie znaki i podział stron należy sprawdzić w docelowej przeglądarce. Emulacja druku nie potwierdza fizycznego wydruku. [Testowanie](TESTING.md).
