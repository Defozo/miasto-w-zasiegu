# Miasto w zasięgu

Kraków w Twoim tempie. Lokalny prototyp v2 na HackYeah 2026: strona informacyjna, aplikacja web/PWA, Android, towarzyszący widok Wear OS i osobna gra Iskry Miasta.

Publiczne demo: [miastowzasiegu.pl](https://miastowzasiegu.pl/).
[Konfiguracja wdrożenia](docs/PUBLIC-DEPLOYMENT.md) i [aktualna marka](docs/BRANDING.md).

## Otwórz lokalnie

- [Strona](http://127.0.0.1:4173/)
- [Aplikacja Miasto w zasięgu](http://127.0.0.1:4173/app)
- [Gra Iskry Miasta](http://127.0.0.1:4173/gra)
- [Stan API](http://127.0.0.1:3081/api/health)
- [Stan ORS](http://127.0.0.1:18082/ors/v2/health)
- [Stan samochodowego ORS](http://127.0.0.1:18083/ors/v2/health)

To adresy na komputerze uruchamiającym projekt. Publiczne demo jest dostępne pod domeną powyżej. Domyślna kompilacja Androida używa `10.0.2.2:3081`, czyli backendu hosta z emulatora; dla telefonu buduj z `-PbackendUrl=https://miastowzasiegu.pl`. Wariant testowy `-PvalidationBuild=true` ma osobny pakiet i katalog `android/phone/build-validation`, aby zachować izolację danych i konfiguracji.

## Uruchomienie

Wymagane: Node.js 24, npm, Python 3.12 i `osmium==4.3.1`. Docker jest potrzebny do własnych silników tras. Android wymaga JDK 17 i Android SDK zgodnie z konfiguracją Gradle.

Repozytorium zawiera aktualne źródła web/PWA, API, Android i Wear OS, lockfile, testy oraz katalog parametrów sprzętu. Duże importy OSM/ZTP, grafy ORS, bazy użytkowników, klucze usług i rendery filmów nie są dołączone. Liczby rekordów podane dalej opisują wcześniejszy import demonstracyjny; ponowny import aktualnych danych może dać inne wyniki.

Na czystym komputerze wykonaj z katalogu repozytorium:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install osmium==4.3.1
.\.venv\Scripts\python.exe experiments/ors/download_osm.py
.\.venv\Scripts\python.exe scripts/import-pois.py
.\.venv\Scripts\python.exe scripts/import-pois.py --parking-only --output server/data/parkings.json
.\.venv\Scripts\python.exe scripts/import-parking-access.py
.\.venv\Scripts\python.exe server/import-locations.py
.\.venv\Scripts\python.exe scripts/import-accessibility.py
node scripts/import-municipal-stops.mjs
node scripts/import-municipal-parkings.mjs
npm run build
npm run dev
```

Na Linux/macOS użyj `.venv/bin/python`. Pobranie danych i import mogą potrwać kilka minut. API potrzebuje `server/data/places.json`; brak importu nie jest trybem demonstracyjnym z fikcyjnymi miejscami. Import miejskich danych może być czasowo niedostępny, co aplikacja pokazuje jawnie. Importy nie wysyłają obserwacji do miejskich usług.

Aby obliczać trasy, uruchom oba silniki po pobraniu PBF:

```powershell
docker compose -f experiments/ors/compose.yml up -d
docker compose -f experiments/ors/compose-drive.yml up -d
```

Pierwsza budowa grafu wymaga pamięci i czasu. Poczekaj na gotowość `http://127.0.0.1:18082/ors/v2/health` oraz `http://127.0.0.1:18083/ors/v2/health`. Szczegóły i zmierzone ograniczenia: [ORS](experiments/ors/README.md). Nie uruchamiaj skryptu harmonogramu jako zamiennika pierwszego importu: jego domyślna konfiguracja obsługuje istniejący serwer demonstracyjny.

`npm run dev` udostępnia web pod `http://127.0.0.1:5173` i API na porcie 3081. Alternatywny start gotowego buildu w Windows: `./Start-Przejscie.ps1`.

Skrypt startuje brakujące procesy lokalne, pozostawia działające usługi i zapisuje logi w `artifacts/runtime`. Do pracy nad kodem zamiast preview można użyć `npm run dev` (API 3081 i Vite 5173), gdy te porty są wolne, lub `npm run dev:web` przy już działającym API.

Nowe wyszukiwanie dokumentacji modeli w sieci wymaga klucza `OPENAI_API_KEY` po stronie API. Jeśli psst jest dostępny, `Start-Przejscie.ps1` automatycznie uruchamia nowe API przez `scripts/start-api-with-psst.ps1`, pobierając globalny sekret `OPENAI_API_KEY` do procesu serwera. Już działające API nie jest restartowane. Sekretów nie zapisujemy w kodzie, APK ani plikach klienta. Przy bezpośrednim starcie `node server/index.mjs` klucz musi być wcześniej dostępny w środowisku tego procesu. Bez klucza nadal działają lokalny katalog, wcześniej zapisane wyniki, ręczny pomiar, adresy, konta i routing. Nowe wyszukiwanie sieciowe zwraca wtedy komunikat o niedostępności.

## Własna konfiguracja

[.env.example](.env.example) zawiera wyłącznie nazwy zmiennych i lokalne wartości przykładowe. Aplikacja czyta środowisko procesu; samo skopiowanie pliku do `.env` nie ładuje konfiguracji. Przekaż wybrane zmienne przez menedżera sekretów albo użyj `node --env-file=.env server/index.mjs` i uruchom web osobno przez `npm run dev:web`. Nie umieszczaj kluczy serwerowych w zmiennych Vite ani w APK.

Bez konfiguracji Clerk działa gość. AI, Street View i płatności są opcjonalne i wymagają własnych usług. Stripe w demonstracji jest w trybie testowym. Skrypty startowe integrujące psst są opcjonalne; zwykłe `npm run dev` go nie wymaga.

Filmy są dostępne w [publicznym demo](https://miastowzasiegu.pl/#film) i [Iskrach Miasta](https://miastowzasiegu.pl/gra#teledysk). Lokalna kopia nie zawiera dużych plików `/media`; odtwarzanie tych filmów i pobieranie APK/PDF wymaga opublikowanych materiałów lub ich osobnego dołączenia. Kod aplikacji i gry pozostaje kompletny.

## Sprawdzenie eksportu

Sprawdzenie izolowanego eksportu 4 października 2026: `npm ci` PASS, `npm run build` PASS, `npm test`: 194 PASS, 2 pominięte testy ORS wymagające osobnego uruchomienia, 0 błędów. Testy korzystały z izolowanych baz oraz kopii publicznych danych OSM/ZTP; bazy i duże importy nie są publikowane. Kontrola startu API potwierdziła odpowiedzi JSON 200 dla zdrowia, miejsc i konfiguracji logowania. Build zgłasza ostrzeżenie o dużym module MapLibre. Nie powtarzano w tej publikacji testów przeglądarki ani urządzeń. Historyczne wyniki, testy urządzeń i ograniczenia dostępności są opisane w [docs/VERIFICATION.md](docs/VERIFICATION.md). Odwołania do lokalnych `artifacts/` w dokumentacji historycznej nie oznaczają załączonych raportów. Brak pełnego audytu WCAG 2.2 AA i testu całej podróży w terenie pozostaje ograniczeniem prototypu.

## Co działa

- Mapa jako główny ekran web/PWA i Androida: **Mapa · Zapisane · Profil**, wyszukiwanie miejsca lub adresu, kategorie, filtry oraz karta warunków przed przyciskiem „Nawiguj”. Android współdzieli interfejs React/MapLibre z webem, dołączony do APK, i zachowuje natywne prowadzenie GPS, głos oraz Wear OS. [Architektura hybrydowa](docs/ANDROID-HYBRID.md). „Pokaż listę” zapewnia tekstowy dostęp do wyników; przesunięcie mapy wymaga jawnego „Szukaj w tym obszarze”.
- Pierwszy start pyta „Jak się poruszasz?” i można go pominąć jednym przyciskiem. Pięć sposobów poruszania się, niezależna opcja auta i kilka zapisanych zestawów. Brak konfiguracji nie przypisuje wózka. Zdjęcie, nazwa modelu i ręczne parametry prowadzą do wspólnego edytora. Wynik AI czeka na zatwierdzenie i nie zastępuje własnego pomiaru.
- Podróże łączone: auto, parking, warunki przesiadki i dalsza trasa. Silniki ORS mają osobne grafy. Przed otwarciem Google Maps zapisujemy plan z kopią potrzeb; powrót przywraca cel i parking. Nieznane wyjście, dostęp do rampy i zajętość pozostają jawnie nieznane. [API, przepływ danych i ograniczenia](server/README.md#mapa-zestawy-i-podróże).

- Paszporty w zakładce **Obiekty**: prywatny szkic, osobne wejścia i pomiary, jawne źródła oraz publikacja do karty i widgetu iframe. Każde konto może poprawiać dane; opcjonalny znacznik domeny potwierdza kontrolę nad stroną. Nowe miejsca są od razu wyszukiwalne. [Przebieg, API i ograniczenia](docs/PLACE-PASSPORTS.md).

- Miejskie dane ZTP: 3298 przystanków jako osobne rekordy z nawierzchnią peronu, typem krawężnika, liczbą ławek i wiat. Karty pokazują źródło, datę zmiany wpisu i pobrania; nie nazywają tych informacji audytem dostępności. Import zachowuje ostatni poprawny zapis przy awarii, a wygasłe punkty znikają również między importami. Import ZTP działa automatycznie codziennie o 04:10 czasu polskiego, a danych OSM w niedzielę o 04:40. [Harmonogram i zakres](docs/DATA-IMPORT-SCHEDULE.md). [Zakres i warunki](docs/MUNICIPAL-STOPS.md).
- Filtry mapy w nawigacji web/PWA, także podczas planowania: dostępne toalety, status dostępności dla wózka, bezpłatność, dostęp ogólny, 24/7 oraz ławki z oparciem i podłokietnikami. Osobno włączane warstwy barier, miejsc odpoczynku, wejść bez schodów i wind. [Źródła, semantyka i ograniczenia](docs/MAP-FILTERS.md).
- Strona reklamująca i opisująca aplikację, autorska animacja schematu miasta z pauzą i obsługą ograniczonego ruchu.
- Responsywna aplikacja z MapLibre/OpenFreeMap i 27 647 obiektami, w tym 14 019 ławkami do wyszukiwania odpoczynku. Wyszukiwanie początku, celu i do 5 przystanków korzysta z dodatkowych **139 045 rekordów: 120 515 adresów i 18 530 segmentów ulic**. To import prostokąta Krakowa i okolicy, nie liczba unikalnych budynków ani gwarantowanych wejść. Każdy wpisany adres trzeba zatwierdzić z podpowiedzi; edycja tekstu unieważnia wcześniejszy wybór.
- Pominięcie pierwszego ekranu otwiera mapę bez przypisywania sprzętu. Pominięcie rozpoznawania zachowuje wybrany rodzaj sprzętu, bez wymyślania wymiarów. Planowanie nie wymaga konta.
- Niezapisane szkice zestawów są oddzielone od aktywnych ustawień trasy i rozdzielone według właściciela. Błąd zapisu nie zmienia używanego zestawu, a późna odpowiedź AI nie kasuje nowszego pomiaru ani nie trafia do innego zestawu. Wyniki dokumentacji wymagają potwierdzenia wariantu i zastosowania przez użytkownika.
- Wspólne konta web i Android przez Clerk z metodami OAuth ustawionymi u dostawcy. Profil można przechowywać lokalnie lub na koncie. Zapis sprawdza wersję i zgłasza konflikt, zamiast nadpisywać nowszą zmianę z drugiego urządzenia. Sesją zarządza SDK, aplikacja nie przyjmuje haseł. Wymagane klucze i konfiguracja: [logowanie](docs/AUTH.md).
- Prywatne zapisane miejsca: Dom, Praca lub własna nazwa, do szybkiego wyboru startu, celu i przystanku. Gość ma osobną listę lokalną, a konto wspólną listę web/Android, do 30 miejsc. Logowanie nie przesyła automatycznie adresów gościa. Ponowny zapis tego samego miejsca pod tą samą nazwą nie tworzy kopii; usunięcie wymaga potwierdzenia.
- Podpowiedzi rozróżniają kilka punktów tego samego adresu nazwą obiektu i krótkim wyjaśnieniem, zamiast ukrywać różnice. Przykładowo Długa 12 ma osobno Fornir i punkt adresowy, a Rynek Główny 1 kilka nazwanych obiektów. Nadal trzeba sprawdzić właściwe wejście.
- Web ma ustawienia większego tekstu, mocniejszego kontrastu i ograniczenia ruchu w profilu. Ustawienia widoku są niezależne od parametrów przejazdu.
- Katalog 13 porównanych modeli oraz wyszukiwarka AI dokumentacji producentów. Nowe zadania `/api/equipment/research` są prywatne dla konta lub sesji gościa i wygasają po 30 minutach. Starsze API katalogowe zachowuje wspólną pamięć wyników dokumentacji. Zdjęcia nie trafiają do tej pamięci, plików publicznych ani logów. Wyniki zachowują źródła, fragmenty uzasadniające parametry, wariant i datę. Zakresy i sprzeczności nie stają się pojedynczym wymiarem.
- Trasy przez rzeczywisty ORS dla Małopolski, z przystankami w wybranej kolejności. API ogranicza punkty do Krakowa i okolicy, a sumę prostych odcinków między nimi do 20 km. Nie ma sztucznych tras awaryjnych.
- „Przerwa po drodze”: do sześciu propozycji ławek, toalet i świeżych odkryć w pobliżu wyliczonej trasy. Podgląd na mapie nie zmienia planu; dodanie zachowuje cel i wymaga ponownego obliczenia. Warunki dostępu, godziny i opłaty są widoczne również w szczegółach miejsc. [Zakres i ograniczenia](docs/REST-STOPS.md).
- Czytelny wydruk planu lub zapis do PDF przez okno drukowania: adresy i przystanki, potrzeby, instrukcje oraz data obliczenia. Wydruk zachowuje ostrzeżenia, nie zamienia historycznej trasy w aktualną. [Opis](docs/PRINT-PLAN.md).
- Zgłoszenia barier w SQLite, czas dodania, rozwiązanie zgłoszenia i omijanie świeżych obserwacji. Zgłoszeniem kontowym zarządza autor. Anonimowe zgłoszenia pozostają dostępne w lokalnym prototypie. Statystyki pochodzą z zapisów, bez przykładowej społeczności.
- Osobne dobre odkrycia: miejsce odpoczynku, wejście bez schodów i działająca w chwili sprawdzenia winda. Web pokazuje aktualne wpisy na mapie i liście. Autor może wycofać swój wpis, a obserwacje wygasają zależnie od typu. Nie zmieniają wybranej trasy i nie potwierdzają dostępności całego miejsca.
- Indywidualny szacunek czasu na podstawie dobrowolnie zapisanych przejazdów. Android przygotowuje podsumowanie rzeczywistej sesji GPS i pyta o zgodę; podgląd i emulator są wykluczone. Po co najmniej 3 kwalifikujących się próbkach tego samego profilu serwer odrzuca odstające czasy względem mediany i stosuje średnią wygładzaną EWMA. Zmienia to przewidywany czas, nie przebieg ani ocenę dostępności trasy. Serwer nie potwierdza GPS niezależnie.
- PWA: instalowalny manifest, lokalne ikony/font i cache własnego interfejsu. Zapis planu ma datę obliczenia, podgląd i potwierdzane usuwanie. Domyślny zapis konta wymaga sprawdzenia właściciela przez internet; jawny zapis z dostępem bez logowania udostępnia instrukcje offline osobom korzystającym z tego urządzenia. Nowe trasy i zgłoszenia potrzebują połączenia. Kafelki mapy nie są pobierane na zapas ani cache'owane przez service worker.
- Android i Wear OS: szczegółowy, osobno zweryfikowany zakres w [docs/ANDROID.md](docs/ANDROID.md).

## Iskry Miasta

Gra pod `/gra` ma własny manifest PWA, ikonę i ogród do urządzania. Sześć treningowych zagadek o stopniu, szerokości, nawierzchni, brakujących danych, odpoczynku i wejściu bez schodów działa bez konta. Postęp treningu jest lokalny; fikcyjne przykłady nie tworzą zgłoszeń na mapie.

Album zachowuje trzy nazwane pocztówki z własnej aranżacji ogrodu, bez nowych punktów ani obserwacji. Ma osobne zapisy treningowe i kontowe na danym urządzeniu, większy podgląd oraz potwierdzane zastępowanie i usuwanie.

Tryb „Moje miasto” korzysta ze wspólnego konta. Misje obejmują przeszkody i dobre odkrycia, zapisywane oddzielnie. Za zapis spełniający wymagania serwera otrzymuje się iskry, a za nie ozdoby czterech grządek. Serwer sprawdza m.in. właściciela, świeżość, położenie, opis i powtórzenia. Punkty oznaczają poprawny zapis, nie niezależny audyt terenowy. Nie ma rankingu, serii dni ani wymogu codziennej gry. Gra nie zmienia OSM i nie wysyła zgłoszeń do miasta.

## Sprawdzenie

```powershell
npm run build
$env:RUN_ORS_TESTS='1'
npm test
npm run test:e2e
```

Testy przeglądarkowe uruchamiają oddzielne API na 3082 z bazą w pamięci i preview na 4174. Każdy plik scenariuszy dostaje świeże procesy i bazę, zachowując normalne limity kont. Polecenie scala wyniki w `artifacts/e2e-runs/<identyfikator>/html/index.html` i zapisuje statusy wszystkich procesów w `runner-summary.json`. Nie dopisuje testowych kont ani barier do zwykłej bazy. Testy routingu wymagają działającego ORS. Jeśli Chromium nie jest zainstalowane: `npx playwright install chromium`. Bieżące wyniki i zakres sprawdzenia są w [docs/VERIFICATION.md](docs/VERIFICATION.md); instrukcje Androida w [tests/android/README.md](tests/android/README.md).

## Granice prototypu

Przy każdym kroku trasy w wersji web można rozwinąć Google Street View. Otwiera się tylko jeden iframe; punkt i kierunek pochodzą z geometrii openrouteservice. Zdjęcia nie potwierdzają przejezdności, a Google może dobrać sąsiedni punkt lub wnętrze. Bez internetu i przy awarii instrukcja tekstowa nadal jest dostępna. Nie zapisujemy panoram w aplikacji ani w trybie offline.

Osadzanie korzysta z istniejącego klucza przeglądarkowego `PRZEJSCIE_GOOGLE_MAPS_BROWSER_KEY` i `/api/integrations/maps`. Wymaga włączonego Maps Embed API oraz tego API w ograniczeniach klucza. `node scripts/enable-street-view.mjs` dodaje tę usługę do istniejącej konfiguracji bez zmiany domen i limitów płatnych usług. Klucz jest ograniczony do domen produkcyjnych, więc lokalne testy używają atrapy ramki. `npx playwright test --config playwright.street-view.config.ts` sprawdza kierunek, obsługę klawiatury, ekran 390 px, awarię konfiguracji i offline, korzystając wyłącznie z izolowanej bazy w pamięci. `node scripts/check-street-view.mjs` sprawdza prawdziwą panoramę w izolowanej przeglądarce pod adresem aplikacji; nie publikuje zmian interfejsu.

Brak pomiaru w OSM nie oznacza braku bariery. Obliczona trasa nie jest potwierdzeniem przejezdności. Status OSM pozostaje deklaracją źródła, a środek obiektu może nie być dostępnym wejściem. Web udostępnia plan i listę instrukcji, nie nawigację GPS w tle.

Wersja lokalna ma integrację Clerk, kontrolę własności zapisów kontowych i podstawowe limity. Bez kluczy Clerk działa tryb gościa. Metody OAuth i weryfikacja adresu zależą od konfiguracji instancji; rzeczywisty przepływ logowania wymaga osobnego sprawdzenia. Przed publikacją potrzebne są moderacja, polityka prywatności, kopie zapasowe, HTTPS i publiczny hosting backendu oraz ORS. API nadal słucha na localhost. Automat telefoniczny i automatyczna analiza Google Street View pozostają poza prototypem. Działanie w terenie i komunikacja ze sparowanym zegarkiem wymagają osobnej walidacji.

## Dokumentacja

- [Audyt zgodności z zadaniem](docs/TASK-AUDIT-2026-10-03.md)
- [Audyt dostępnych danych miejskich](docs/MUNICIPAL-DATA-AUDIT.md)
- [Pierwsza integracja danych miasta: przystanki ZTP](docs/MUNICIPAL-STOPS.md)
- [Finalny plan](docs/PLAN.md)
- [Gra Iskry Miasta](docs/GAME.md)
- [Android i Wear OS](docs/ANDROID.md)
- [Prywatne zapisane miejsca](docs/FAVORITES.md)
- [Zapis planu i tryb offline](docs/SAVED-PLANS.md)
- [Routing, nawierzchnie i omijanie barier](docs/ROUTING.md)
- [Przerwa po drodze i zasady korzystania z miejsc](docs/REST-STOPS.md)
- [Telefon, Street View i licencje](docs/LEGAL-TECH.md)
- [Wnioski z publicznych forów](docs/USER-RESEARCH.md)
- [API i kontrakty](server/README.md)
- [Wyniki eksperymentów ORS i wózków](EXPERIMENTS.md)
- [Stan testów i ograniczenia](docs/VERIFICATION.md)

Mapa: © OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap. Routing: openrouteservice/HeiGIT. Mapy i dane mają własne licencje; szczegóły źródeł przy rekordach oraz w dokumentacji eksperymentów.
