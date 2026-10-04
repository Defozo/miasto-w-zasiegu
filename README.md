# Miasto w zasięgu

Miasto w zasięgu pomaga ocenić, czy miejsce i droga odpowiadają własnym potrzebom. Łączy mapę Krakowa, konkretne informacje o barierach i udogodnieniach, planowanie tras oraz obserwacje mieszkańców. Potrzeby można ustawić bez podawania diagnozy i bez konta.

Projekt na HackYeah 2026 obejmuje web/PWA, aplikację Android, towarzyszący widok Wear OS i grę Iskry Miasta.

- [Otwórz mapę](https://miastowzasiegu.pl/app)
- [Pobierz Android / Wear OS](https://miastowzasiegu.pl/#aplikacje)
- [Otwórz Iskry Miasta](https://miastowzasiegu.pl/gra)
- [Zobacz cennik demonstracyjny](https://miastowzasiegu.pl/cennik)

## Główny scenariusz

1. Wybierz sposób poruszania się i potrzebne ograniczenia albo pomiń konfigurację. Opcjonalne wymiary sprzętu można wpisać ręcznie; podpowiedzi z dokumentacji wymagają zatwierdzenia.
2. Znajdź miejsce, adres lub trasę. Mapa ma tekstową listę wyników, kategorie i filtry. Przesunięcie widoku nie zmienia wyników bez wybrania „Szukaj w tym obszarze”.
3. Sprawdź schody, progi, nawierzchnię, wejście, toaletę i odpoczynek wraz ze źródłami, datami i brakami danych. Brak pomiaru pozostaje niewiadomą.
4. Wyznacz trasę zgodną z ustawionymi potrzebami. Możesz dodać do pięciu przystanków, wybrać przerwę po drodze albo podróż łączącą auto, parking i dalszą drogę.
5. Zapisz lub wydrukuj plan. Android może prowadzić z GPS i głosem; Wear OS pokazuje przekazane instrukcje. Obliczona trasa nie jest gwarancją przejezdności.

## Funkcje

- Wspólne konta Clerk, prywatne zapisane miejsca i kilka zestawów potrzeb. Gość ma oddzielne dane na urządzeniu; logowanie nie importuje ich automatycznie. Konflikt wersji nie nadpisuje nowszego profilu.
- Warstwy OSM oraz przystanków i parkingów P+R ZTP. Fakty źródłowe, obserwacje społeczności i braki pomiarów mają odrębne znaczenie. Importy ZTP i OSM obsługuje [harmonogram](docs/DATA-IMPORT-SCHEDULE.md); grafy tras aktualizuje się osobno.
- Zgłoszenia barier z punktem, linią lub obszarem, pomiarami, terminami ważności, potwierdzeniami i rozbieżnościami. Dobre odkrycia, np. miejsce odpoczynku, są oddzielone od przeszkód.
- Paszporty obiektów: prywatny szkic, osobne wejścia, źródło i data każdej cechy, historia i publiczny widget. Sprzeczne informacje pozostają widoczne. Potwierdzenie kontroli domeny nie jest certyfikatem dostępności.
- Opcjonalny asystent dokumentacji sprzętu, analiza zdjęcia zgłaszającego i odczyt publicznych stron obiektów. Użytkownik sprawdza propozycje; model nie potwierdza pomiaru ani położenia bariery.
- Opcjonalne podglądy Google Places i Street View. Informacje Google pozostają w komponentach dostawcy; aplikacja nie buduje z panoram własnej bazy barier.
- Większy tekst, mocniejszy kontrast, ograniczenie ruchu, obsługa klawiatury i tekstowe odpowiedniki informacji mapy. Cel rozwoju to WCAG 2.2 AA; pełna zgodność nie została potwierdzona.

## Iskry Miasta

Główny widok `/gra` proponuje odkrywanie brakujących informacji i ponowne sprawdzanie zgłoszeń. Konkretne obserwacje pozwalają zdobywać XP, odznaki i własną kartę osiągnięć. Zgłoszenie zmiany i potwierdzenie poprzedniego opisu są nagradzane jednakowo. Nagroda oznacza wkład spełniający reguły zapisu, nie niezależną weryfikację terenową.

Trening, ogród i album są dostępne pod `/gra?tryb=ogrod`. Sześć fikcyjnych zagadek działa bez konta i nie tworzy zgłoszeń na prawdziwej mapie. Postęp treningu i pocztówki są przechowywane na urządzeniu. [Osiągnięcia i misje](docs/ISKRY-EXPLORER.md), [ogród i trening](docs/GAME.md).

## Uruchomienie

Wymagane: Node.js 24, npm, Python 3.12 i `osmium==4.3.1`. Własne silniki tras wymagają Dockera. Wymagania JDK i Android SDK opisuje [instrukcja Androida](docs/ANDROID.md).

Repozytorium zawiera źródła web/PWA, API, Androida i Wear OS, lockfile, testy i katalog parametrów sprzętu. Nie zawiera dużych importów OSM/ZTP, grafów ORS, baz użytkowników, kluczy usług ani renderów filmów. Dane trzeba pobrać, a liczba wyników zależy od daty i zakresu importu.

Z katalogu repozytorium w PowerShell:

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

Na Linux/macOS użyj `.venv/bin/python`. API potrzebuje `server/data/places.json`; brak importu nie włącza fikcyjnych miejsc. Importy nie wysyłają obserwacji do miejskich usług. Awaria miejskiego źródła jest ujawniana, a ostatnia poprawna kopia pozostaje dostępna.

Po pobraniu PBF uruchom silniki tras:

```powershell
docker compose -f experiments/ors/compose.yml up -d
docker compose -f experiments/ors/compose-drive.yml up -d
```

Pierwsza budowa grafów wymaga pamięci i czasu. Poczekaj na gotowość `http://127.0.0.1:18082/ors/v2/health` i `http://127.0.0.1:18083/ors/v2/health`. [Konfiguracja ORS](experiments/ors/README.md). Harmonogram aktualizacji nie zastępuje pierwszego importu i wymaga dostosowania do własnej instalacji.

`npm run dev` uruchamia web na `http://127.0.0.1:5173` i API na porcie 3081. Alternatywny start gotowego buildu w Windows: `./Start-Przejscie.ps1`, z podglądem na porcie 4173. Skrypt pozostawia działające usługi; przy już uruchomionym API do pracy nad webem można użyć `npm run dev:web`.

## Konfiguracja usług

[.env.example](.env.example) zawiera nazwy zmiennych i lokalne wartości przykładowe. Aplikacja czyta środowisko procesu; samo skopiowanie pliku do `.env` nie ładuje konfiguracji. Użyj menedżera sekretów albo `node --env-file=.env server/index.mjs`, uruchamiając web osobno przez `npm run dev:web`. Klucze serwerowe nie mogą trafiać do zmiennych Vite ani APK.

Bez Clerk działa tryb gościa. Nowe wyszukiwania AI wymagają `OPENAI_API_KEY` w procesie API. Bez niego pozostają katalog, pomiar ręczny i zapisane wyniki. Street View, Google Places i płatności wymagają własnej konfiguracji. Skrypty psst są opcjonalne; zwykłe `npm run dev` go nie wymaga. Szczegóły: [logowanie](docs/AUTH.md), [płatności](docs/BILLING.md), [własne wdrożenie](docs/PUBLIC-DEPLOYMENT.md).

Domyślny build Androida używa `http://10.0.2.2:3081`, czyli hosta emulatora. Telefon wymaga dostępnego backendu HTTPS i odpowiedniego `-PbackendUrl`. Wariant `-PvalidationBuild=true` używa osobnego pakietu, aby oddzielić dane testowe.

Filmy, APK i PDF udostępnione w publicznym demo nie są częścią źródłowej kopii repozytorium. Ich lokalne odtwarzanie i pobieranie wymaga osobnego dołączenia materiałów.

## Testy i ograniczenia

```powershell
npm run build
npm test
npm run test:e2e
```

[Instrukcja testowania](docs/TESTING.md) opisuje izolowane bazy, testy ORS i urządzeń. Wynik kompilacji lub AXE nie zastępuje pełnego przebiegu czytnikiem ekranu ani rzeczywistej podróży.

Web planuje trasę i udostępnia instrukcje; nie prowadzi GPS w tle. Android wymaga osobnej walidacji terenowej, w tym baterii, utraty sygnału i sparowanego zegarka. Podgląd Street View może pokazać sąsiedni punkt lub wnętrze. Zapisany plan zawiera historyczny wynik; nowe trasy i zgłoszenia wymagają internetu. Kafelki mapy nie są pobierane na zapas.

Płatności demonstracyjne korzystają z trybu testowego Stripe. Publiczny prototyp nie oznacza zatwierdzonej sprzedaży, pełnego audytu bezpieczeństwa ani umowy utrzymaniowej. [Utrzymanie i model biznesowy](docs/OPERATIONS-AND-BUSINESS.md) opisują obowiązki operatora, budżet pilotażu i warunki rozwoju.

## Dokumentacja

- [Źródła, licencje, aktualizacja i jakość danych](docs/DATA-SOURCES.md)
- [Przystanki ZTP](docs/MUNICIPAL-STOPS.md) i [harmonogram importów](docs/DATA-IMPORT-SCHEDULE.md)
- [Paszporty miejsc i widget](docs/PLACE-PASSPORTS.md)
- [Filtry mapy](docs/MAP-FILTERS.md), [routing](docs/ROUTING.md) i [przerwa po drodze](docs/REST-STOPS.md)
- [Zapisane miejsca](docs/FAVORITES.md), [plan offline](docs/SAVED-PLANS.md) i [wydruk](docs/PRINT-PLAN.md)
- [Android i Wear OS](docs/ANDROID.md) oraz [architektura hybrydowa](docs/ANDROID-HYBRID.md)
- [API i kontrakty](server/README.md), [testowanie](docs/TESTING.md) i [wdrożenie](docs/PUBLIC-DEPLOYMENT.md)
- [Utrzymanie i model biznesowy](docs/OPERATIONS-AND-BUSINESS.md)

Mapa: © OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap. Routing: openrouteservice/HeiGIT. Dane i usługi mają odrębne warunki opisane w [źródłach](docs/DATA-SOURCES.md).
