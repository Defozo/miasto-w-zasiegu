# Paszporty miejsc i widget

## Przebieg użytkownika

W aplikacji otwórz **Obiekty**, zaloguj się i wyszukaj nazwę albo adres. Wybierz istniejące miejsce lub dodaj nowe po sprawdzeniu wyników. Każde konto może uzupełnić dowolny obiekt; nie ma wyłączności właściciela ani kolejki ręcznej akceptacji.

Formularz zapisuje prywatny szkic. Osobno podaje się informacje o obiekcie i każdym wejściu: schody, próg, szerokość, podjazd, windę, nawierzchnię, toaletę, odpoczynek, godziny i pomoc personelu. Pole może pozostać nieznane. Źródło, link i data obserwacji są przypisywane do konkretnej cechy. Data publikacji nie jest datą pomiaru.

**Zapisz i zobacz podgląd** zapisuje tylko szkic. Dopiero **Opublikuj** udostępnia dane w karcie, katalogu, wyszukiwaniu i widgecie. Podgląd pokazuje wkład autora; publiczna karta uwzględnia także pozostałe źródła i sprzeczności. Niezapisany formularz pozostaje podczas zmiany zakładek. Zmiana konta odcina poprzedni formularz.

Wersje szkicu i publikacji są sprawdzane osobno. Konflikt nie nadpisuje nowszej wersji. Przy cudzej publikacji można porównać dane, połączyć własne zmiany z aktualną wersją, przejrzeć wynik i ponownie opublikować. Zmiana prywatnego szkicu w drugiej karcie wymaga jawnego wczytania jego aktualnej wersji. Historia zachowuje autora, datę, zakres zmian i migawkę publikacji.

## Jedna publikacja, dwa widoki

Widok `/embed/places/:placeId` oraz karta aplikacji korzystają z `GET /api/place-passports/:placeId` i wspólnego `PassportCard`. Kod iframe jest dostępny po publikacji; zawiera opisowy tytuł, szerokość 100%, leniwe ładowanie i wyłączenie referrera.

Widget nie wymaga logowania. Publiczne żądania mają `credentials: omit`, nie pobierają tokenów i nie czytają profilu ani pamięci przeglądarki. Widget nie montuje dostawcy uwierzytelniania i nie rejestruje service workera. Odświeża się co 60 sekund oraz po odzyskaniu fokusu, widoczności i połączenia. Po błędzie pozostawia ostatnią otrzymaną wersję z datą pobrania i ostrzeżeniem o możliwej nieaktualności.

Przycisk planowania otwiera `/app?place=…&entrance=…` w nowej karcie. Aplikacja zachowuje potrzeby użytkownika i ustawia cel; wyznaczenie trasy wymaga osobnego uruchomienia. Wejście bez współrzędnych nie udaje dokładnego celu. Ogólny punkt obiektu może być środkiem budynku.

Kod skopiowany z `127.0.0.1` działa tylko lokalnie. Do publicznego osadzenia potrzebne są adres HTTPS aplikacji, działające API i nowy kod iframe. Przy wdrożeniu należy zezwolić na osadzanie publicznej ścieżki widgetu i osobno ograniczyć strony konta.

## Dane i źródła

SQLite przechowuje oddzielnie `place_passport_drafts`, `place_passports`, `place_passport_revisions` i `site_verifications`. Publikacja nie zmienia importowanych rekordów OSM/ZTP. Katalog jest projekcją importów oraz publikacji. Nowe miejsca mają ID `community-place-…`; obsługiwane są także noclegi i usługi.

Każda publiczna cecha ma dowody, autorstwo, źródło i oddzielne daty. Różne aktualne wartości z różnych źródeł dają stan sprzeczności i `value: null`. Nieznana wartość nie usuwa cudzego pomiaru. Poprawka tego samego autora zastępuje jego bieżący dowód, zachowując poprzedni w historii. Niezmienione cechy zachowują autorstwo. Publiczne API nie ujawnia identyfikatorów kont ani adresów e-mail.

Odświeżenie importu nie usuwa publikacji. Utrata oryginalnego źródła pozostawia oznaczony stary zapis; karta pokazuje jego pochodzenie i daty. Aktualizacja paszportu nie zmienia grafu ORS i nie gwarantuje przejezdności. Dodanie miasta wymaga importów, granic walidacji i grafu tras; kategoria wymaga rozszerzenia wspólnego modelu oraz filtrów.

## Opcjonalne potwierdzenie strony

Autor może wygenerować znacznik `meta` dla dokładnej domeny HTTPS i umieścić go w `head` strony głównej. Wyzwanie wygasa po 24 godzinach, potwierdzenie po 30 dniach. Nowy znacznik unieważnia poprzednie wyzwanie. Potwierdzenie jest związane z kontem i domeną. Nie oznacza własności obiektu, audytu dostępności ani wyłącznego prawa edycji. Cudzy autor nie przejmuje oznaczenia przez zmianę tego samego obiektu.

Pobieranie ogranicza protokół i port, sprawdza wszystkie zwrócone adresy DNS, blokuje adresy prywatne/specjalne, przypina połączenie do sprawdzonego IP i zachowuje TLS dla domeny. Nie śledzi przekierowań ani nie przekazuje poświadczeń. Limity obejmują rozmiar, czas, równoległość i częstość prób. Element `meta` w `head` jest sprawdzany przez parser [parse5](https://parse5.js.org/functions/parse5.parse.html); komentarze i skrypty nie stanowią potwierdzenia. W bazie pozostaje skrót tokenu.

## API i utrzymanie

- Publiczne: `GET /api/place-passports/:placeId`, `/:placeId/history`, `/:placeId/history/:revision`.
- Prywatne: `GET /api/place-passports/mine`, `POST /drafts`, `GET|PUT /drafts/:id`, `POST /drafts/:id/publish`, `POST /drafts/:id/rebase`.
- Domeny: `GET|POST /api/site-verifications`, `POST /api/site-verifications/:id/check`.
- Prywatne odczyty i mutacje sprawdzają `expectedUserId`; zapis i publikacja dodatkowo oczekiwane wersje.
- Body paszportu: do 128 KiB, maksymalnie 8 wejść, ograniczenia długości i typów. Pozostałe trasy zachowują 16 KiB.

Prywatny klient korzysta z bieżącego uwierzytelniania aplikacji i pobiera token dla żądania. Testy wstrzykują osobny adapter, bez zewnętrznych kont i zwykłej bazy. Operator musi utrzymywać hosting HTTPS, kopie bazy, aktualizację źródeł oraz obsługę korekt i nadużyć. Pełne zaplecze moderacji i procedurę obsługi opisano jako element stałego pilotażu w [modelu utrzymania](OPERATIONS-AND-BUSINESS.md).

Paszport i widget mogą być podstawą płatnej obsługi obiektów: osadzenia widgetu, pomocy w pozyskaniu pomiarów i utrzymania aktualności. To hipoteza biznesowa, nie pozyskani klienci; potwierdzenie domeny nie jest certyfikatem dostępności.

## Testy i ograniczenia

Testy obejmują prywatność, konflikty, import/restart, widoczność nowych miejsc, pochodzenie danych i bezpieczny odczyt strony. E2E sprawdza publikację, izolację widgetu, odświeżanie, błędy, mały ekran i klawiaturę. Fikstury używają baz w pamięci lub plików tymczasowych. [Uruchamianie testów](TESTING.md).

Pełna zgodność WCAG 2.2 AA i terenowa dostępność wejść nie zostały potwierdzone. Osadzenie na zewnętrznej domenie oraz potwierdzenie kontroli strony wymagają próby w docelowym środowisku HTTPS. Test transportu nie oznacza potwierdzenia domeny.
