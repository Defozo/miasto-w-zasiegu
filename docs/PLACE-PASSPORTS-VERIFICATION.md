# Odbiór paszportów i widgetu, 3 października 2026

Zakres funkcji i ograniczenia: [PLACE-PASSPORTS.md](PLACE-PASSPORTS.md).

## Wykonane sprawdzenia

| Sprawdzenie | Wynik |
| --- | --- |
| `npm run build` | PASS: TypeScript, Vite i generowanie service workera |
| `npm test` | 125 PASS, 0 FAIL, 2 SKIP; 127 przypadków |
| E2E: `passports`, `map-filters`, `exploring`, `place-facts`, `readability`, `municipal-stops` | 22/22 PASS, 1,7 min |
| Publiczny widget przy szerokości 320 px | Treść czytelna; szerokość dokumentu 320 px, brak przewijania poziomego |
| Lokalny katalog po uruchomieniu nowego API | 30 945 miejsc; bez fikcyjnych publikacji testowych |
| Publiczny odczyt paszportu Sukiennic przez frontend 4173 | HTTP 200, właściwa nazwa, wersja 0 oznaczona jako dane źródłowe |
| Lokalna gotowość API i ORS | `status: ok`, `routing: ready` |

Logi: [backend](../artifacts/passport-backend-tests.log), [E2E](../artifacts/passport-e2e-tests.log). Zrzuty z kontroli przez agent-browser: [widget 320 px](../artifacts/passport-widget-mobile.png), [widget desktop](../artifacts/passport-widget-desktop.png), [panel Obiekty](../artifacts/passport-browser-initial.png).

## Co potwierdzają testy

- Nowe obiekty i ich adresy pojawiają się w katalogu bez restartu. Publikacja nie dubluje źródłowych punktów adresowych.
- Szkice są prywatne. Publikacja wymaga jawnej akcji, oczekiwanej wersji i zgodnego konta. Import i restart nie usuwają wkładu użytkownika.
- Dwie osoby mogą poprawiać obiekt. Sprzeczne wartości zachowują dowody, a równoczesna edycja nie nadpisuje nowszej publikacji. Osobno sprawdzono konflikt szkicu w dwóch kartach.
- Widget i aplikacja pokazują tę samą wersję; błędy odświeżania pozostawiają poprzednią wersję z ostrzeżeniem. Widget nie czyta storage ani nie wysyła cookies/tokenów.
- Rzeczywista ramka między dwoma lokalnymi originami działa przy włączonym ograniczeniu ciasteczek stron trzecich. Dokument rodzica obsługuje osobny serwer HTTP na losowym porcie.
- Kliknięcie wejścia otwiera aplikację z właściwym celem i zachowanym profilem. Nie uruchamia samoczynnie obliczania trasy.
- Prywatny klient pobiera świeży Bearer, obsługuje anulowanie i zachowuje kod konfliktu; publiczny odczyt nie pobiera tokenu.
- Testy domen sprawdzają rzeczywiste parsowanie HTML, ważność znacznika, związanie z kontem i domeną, prywatne adresy IP, przypięcie połączenia, TLS, przekierowania, limity i wyścigi. Dodatkowo pobrano rzeczywistą stronę HTTPS `example.org` (577 bajtów); nie było to potwierdzenie własności domeny.

## Granice odbioru

Dwa pominięte przypadki backendu są oznaczone jako testy live ORS. Wybrane E2E planowania korzystały z lokalnego silnika, ale nie wykonano testów terenowych. AXE, klawiatura i kontrola wyglądu nie są pełnym audytem WCAG ani badaniem czytnikiem ekranu.

Testy zapisów używały wyłącznie baz w pamięci lub plików tymczasowych i testowego adaptera kont. Podczas odbioru zwykła instancja zgłaszała `Clerk configured: false`; konfiguracja logowania trwa w osobnym zadaniu. Publiczne odczyty i widget działają lokalnie. Możliwość zalogowania i publikacji w zwykłej instancji wymaga zakończenia konfiguracji Clerk. Nie potwierdzono publicznego hostingu ani osadzenia na rzeczywistej zewnętrznej stronie HTTPS.

## Dodatkowy niezależny audyt UX

Przeprowadzono dwa przeglądy w świeżych, izolowanych przeglądarkach, bez historii rozmowy i kodu źródłowego. Każdy objął stronę startową, aplikację, listę obiektów, edytor oraz dwa widgety. Interakcje korzystały z oddzielnej bazy w pamięci i jawnie testowego obiektu.

Pierwszy przegląd wskazał błędną nazwę regionu listy obiektów i edytora: „Planowanie przejścia”. Poprawiono nazwę regionu w zależności od sekcji, a widok obiektów powiązano z jego aktualnym nagłówkiem. Kontrola drzewa dostępności potwierdziła kolejno: „Obiekty”, „Dane Twojego obiektu”, „Sprawdź przed publikacją”, „Dane opublikowane” i „Planowanie przejścia”.

Po poprawce `npm run build` oraz istniejące testy `passports.spec.ts` i `readability.spec.ts` przeszły: **8/8**, 35,9 s. Ponowny niezależny audyt nie zgłosił kolejnych usterek.

Końcowy wynik audytu jest **częściowy**: przeglądarka audytora przestała odpowiadać podczas kontroli mobilnej. Nie ukończono niezależnej kontroli kontrastu, zoomu 200%, pełnego procesu publikacji ani wszystkich stanów błędów. Automatyczne E2E obejmowały publikację, konflikty, odświeżanie widgetu i mały ekran, ale nie zastępują niezależnego przeglądu ani testu rzeczywistym czytnikiem ekranu. W trakcie audytu zmieniały się inne pliki repozytorium; trzy pliki poprawki zachowały zgodne sumy kontrolne. Nie jest to potwierdzenie pełnej zgodności WCAG.
