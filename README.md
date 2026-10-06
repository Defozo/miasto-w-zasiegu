# Miasto w zasięgu

Sprawdź warunki miejsca i zaplanuj drogę pod własne potrzeby. Miasto w zasięgu łączy mapę Krakowa, informacje o wejściach i barierach, planowanie podróży oraz obserwacje mieszkańców. Szerokość przejścia, krawężnik, nachylenie czy miejsce odpoczynku można ocenić z myślą o konkretnej osobie. Ustawienie potrzeb nie wymaga diagnozy ani konta.

[Zobacz projekt i materiały](https://hackyeah-2026-projekty.defozo.chatgpt.site/#cracow-without-barriers) · [Uruchom lokalnie](#uruchomienie) · [Poznaj Iskry Miasta](docs/ISKRY-EXPLORER.md)

## Zaplanuj wyjście i zabierz plan ze sobą

1. **Ustaw swoje potrzeby.** Wybierz sposób poruszania się, dopuszczalny krawężnik, nachylenie i szerokość. Wymiary sprzętu wpisz ręcznie lub zatwierdź podpowiedź z dokumentacji producenta.
2. **Sprawdź miejsce przed wyjściem.** Zobacz wejście, schody, próg, nawierzchnię, toaletę i odpoczynek. Karta pokazuje źródła, daty i rozbieżności, aby było wiadomo, co opisano i co wymaga sprawdzenia.
3. **Ułóż podróż.** Dodaj do pięciu przystanków po drodze, zaplanuj przerwę albo połącz dojazd samochodem z parkingiem i dalszą drogą. Routing uwzględnia ustawione ograniczenia i aktualne zgłoszenia przeszkód na przebiegu trasy.
4. **Zachowaj plan.** Zapisz go do późniejszego odczytu lub wydrukuj. Prywatne zapisane miejsca i zestawy potrzeb na koncie są dostępne w webie i na Androidzie.

Źródła, daty i statusy informacji pomagają ocenić plan przed podróżą. Karta rozróżnia opisane warunki, rozbieżności i informacje do uzupełnienia. [Jak interpretować trasę](docs/ROUTING.md) i [zakres walidacji](docs/TESTING.md).

## Jedna mapa, kilka sposobów korzystania

| Aplikacja | Co daje użytkownikowi |
| --- | --- |
| **Web i PWA** | Mapa z tekstową listą wyników, filtry, planowanie, zapisane miejsca, zgłoszenia i wydruk planu |
| **Android** | Wspólny interfejs planowania oraz natywna mapa prowadzenia, GPS i instrukcje głosowe po polsku |
| **Wear OS** | Towarzyszący widok bieżącej instrukcji z telefonu i stanu połączenia |
| **Iskry Miasta** | Osobny widok gry z misjami uzupełniania danych, ponownego sprawdzania obserwacji, odznakami i kartą osiągnięć |

Telefon uruchamia prowadzenie po zgodzie na lokalizację. Zegarek wygasza nieaktualną instrukcję, a tekstowy plan pozostaje dostępny także przy problemie z podkładem mapy. [Instrukcja Androida i Wear OS](docs/ANDROID.md) opisuje instalację, wymagania urządzeń i zakres sprawdzonego działania.

## Informacje z mapy, miasta, mieszkańców i stron obiektów

Miasto w zasięgu zestawia cztery uzupełniające się źródła:

- **OpenStreetMap** dostarcza miejsca, parkingi, adresy, drogi i opisane bariery.
- **Dane miejskie ZTP** uzupełniają przystanki i parkingi P+R. Jednoznacznie dopasowane rekordy są łączone z OSM z zachowaniem obu źródeł i różnic między nimi.
- **Obserwacje użytkowników** zawierają lokalizację, czas, opis i pomiary. Można zgłosić punkt, odcinek lub obszar, potwierdzić poprzedni opis albo wskazać zmianę. Historia i okres ważności pomagają wracać do informacji, które wymagają aktualizacji.
- **AI odczytuje publiczne strony obiektów** i deklaracje dostępności, wyszukując konkretne warunki wejścia, windy czy toalety. Wynik zachowuje link, krótki cytat i datę oraz odróżnia deklarację ze strony od obserwacji w terenie.

**Paszport obiektu** porządkuje cechy i osobne wejścia, pozwala przygotować prywatny szkic oraz udostępnić opublikowane informacje w widgetcie. Źródło i historia pozostają przy każdej cesze. Opcjonalny asystent zdjęcia pomaga opisać zgłoszenie, a użytkownik sprawdza treść, miejsce i własne pomiary. Kontrola domeny potwierdza dostęp do strony; nie jest certyfikatem dostępności.

Katalog ma [harmonogram importów](docs/DATA-IMPORT-SCHEDULE.md), a grafy tras aktualizuje się osobno. Opcjonalne podglądy Google Places i Street View pomagają obejrzeć otoczenie w komponentach dostawcy. Szczegóły pochodzenia, aktualizacji i warunków użycia: [źródła danych](docs/DATA-SOURCES.md).

## Iskry Miasta: odkrywanie, które uzupełnia mapę

Gra proponuje miejsca z brakującymi informacjami i zgłoszenia potrzebujące ponownego sprawdzenia. Konkretna obserwacja, pomiar lub aktualizacja pozwala zdobywać XP, odznaki i własną kartę osiągnięć. Potwierdzenie poprzedniego opisu i zgłoszenie zmiany są nagradzane jednakowo. Dzięki temu zadanie polega na opisaniu tego, co zastano na miejscu.

Gra korzysta ze wspólnego przepływu zgłoszeń i asystenta zdjęć. Odznaki oznaczają wkład spełniający reguły zapisu, bez zastępowania niezależnej weryfikacji terenowej. [Misje i osiągnięcia](docs/ISKRY-EXPLORER.md).

Pod `/gra?tryb=ogrod` czekają trening, ogród i album. Sześć fikcyjnych zagadek pozwala poznać zasady bez konta; postęp i pocztówki pozostają na urządzeniu, a trening nie zmienia prawdziwej mapy. [Ogród i trening](docs/GAME.md).

## Interfejs dopasowany do użytkownika

Większy tekst, mocniejszy kontrast, ograniczenie ruchu, obsługa klawiatury i tekstowe odpowiedniki mapy pozwalają wybrać wygodniejszy sposób korzystania. [Instrukcja testowania](docs/TESTING.md) opisuje sprawdzane scenariusze, technologie asystujące i zakres walidacji.

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

## Testowanie i korzystanie z demonstracji

```powershell
npm run build
npm test
npm run test:e2e
```

[Instrukcja testowania](docs/TESTING.md) opisuje izolowane bazy, testy ORS, sprawdzenie urządzeń i zakres walidacji dostępności.

Web służy do planowania i odczytu instrukcji, a prowadzenie GPS jest częścią aplikacji Android. Zapisany plan zachowuje wynik z chwili obliczenia; nowe trasy, zgłoszenia i podkład mapy wymagają internetu. Szczegółowe warunki korzystania opisują [routing](docs/ROUTING.md), [Android](docs/ANDROID.md) i [zapisane plany](docs/SAVED-PLANS.md).

Płatności w [cenniku demonstracyjnym](https://miastowzasiegu.pl/cennik) korzystają z trybu testowego Stripe. [Utrzymanie i model biznesowy](docs/OPERATIONS-AND-BUSINESS.md) opisują przygotowanie stałego wdrożenia, odpowiedzialność operatora i budżet pilotażu; [konfiguracja płatności](docs/BILLING.md) określa warunki przejścia do sprzedaży.

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
