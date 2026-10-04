# Miejskie przystanki ZTP

Pierwszy rzeczywisty import wykonano 2026-10-03T10:25:09.468Z. Źródło zwróciło 3436 rekordów w obszarze obsługi, z których 3298 przyjęto. Przetworzono 7 stron. Odrzucono 38 nieobsługiwanych typów przystanku, 87 grup prywatnych/zawieszonych/innych oraz 13 rekordów z przyszłym początkiem obowiązywania. To import danych źródłowych, nie audyt terenowy. Główne API i web używają już tej warstwy; odczyt 3081 o 10:32 UTC potwierdził 30 945 miejsc. Odbiór UI i zachowania przy awarii opisano poniżej.

## Źródło i warunki

- [Karta zbioru w Portalu Otwartych Danych Krakowa](https://otwartedane.um.krakow.pl/zbiory-danych/komunikacja-miejska-w-krakowie-kmk), dostawca: Zarząd Transportu Publicznego w Krakowie. Portal deklaruje codzienną aktualizację.
- [Publiczna warstwa danych](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Przystanki_Komunikacji_Miejskiej_w_Krakowie/FeatureServer/0).
- [Warunki wykorzystania](https://otwartedane.um.krakow.pl/warunki-wykorzystania-danych-udostepnianych-w-portalu): bezpłatne ponowne wykorzystanie, wskazanie Gminy Miejskiej Kraków i portalu oraz czasu wytworzenia i pozyskania danych, z zastrzeżeniem warunków konkretnego zbioru. Nie przypisujemy licencji CC, której karta nie deklaruje.
- [Dokumentacja paginacji ArcGIS](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/): `resultOffset`, `resultRecordCount`, `orderByFields` i `exceededTransferLimit`.

W metadanych pierwszego importu zmiana całej warstwy miała datę 2026-10-02T12:28:10.822Z. Rekordy zachowują własny `EditDate`. Żadna z tych dat nie oznacza dzisiejszych oględzin, a data pobrania nie jest datą wytworzenia informacji.

## Uruchamianie

```powershell
node scripts/import-municipal-stops.mjs
# Osobny snapshot np. do eksperymentu:
node scripts/import-municipal-stops.mjs --output C:/moja-sciezka/municipal-stops.json
node --test tests/backend/municipal-stops.test.mjs
```

Importer ma stały publiczny endpoint, nie przyjmuje dowolnego URL i nie wymaga sekretów. Nie podąża za przekierowaniami. Pobiera wyłącznie wskazane pola; `Editor` nie jest pobierany ani zapisywany. Limit pojedynczej odpowiedzi wynosi 4 MiB, całości 20 000 rekordów, próby pobrania 12 s, całego importu 120 s. Kod wyjścia 0 oznacza zakończony poprawny import; 1 oznacza błąd, 2 niepoprawne argumenty CLI.

Pierwszy import był ręczny. Od 4 października zadanie `MiastoWZasiegu-Import-ZTP` automatycznie odświeża przystanki i P+R codziennie o 04:10 czasu polskiego. Instalacja, wyniki, ponawianie i warunki pracy serwera są opisane w [DATA-IMPORT-SCHEDULE](DATA-IMPORT-SCHEDULE.md).

## Integralność i zachowanie po awarii

`server/data/municipal-stops.json` zawiera `schemaVersion`, `source`, `sync`, `places`. `sync.status` przyjmuje `success` lub `error`; poza plikiem loader zwraca również `missing`. Metadane obejmują `lastAttemptAt`, `lastSuccessAt`, `sourceUpdatedAt`, liczniki i bezpieczny komunikat błędu.

Importer sprawdza schemat i obsługę stronicowania, odpytuje licznik w bbox `[19.75,49.9,20.25,50.2]`, pobiera strony po 500 rekordów uporządkowane po `OBJECTID`. Sprawdza liczbę i unikalność rekordów oraz datę zmiany warstwy przed i po pobraniu. Puste źródło, niekompletna strona, duplikaty albo spadek przyjętej liczby poniżej połowy poprzedniego zestawu nie zastępują poprawnych danych. Taki spadek wymaga zbadania, a nie automatycznego zatwierdzenia.

Zapis używa pliku tymczasowego w tym samym katalogu, `fsync` i podmiany przez `rename`. Powstaje też `municipal-stops.json.last-good.json`. Błąd źródła zapisuje nowy status próby, ale zachowuje poprzednie rekordy, ich daty pobrania i czas ostatniego sukcesu. Przy pierwszej awarii bez wcześniejszych danych zapisuje pusty zbiór ze statusem błędu, bez wymyślonych miejsc. Uszkodzony główny plik może być odczytany z ostatniej poprawnej kopii.

Jeśli proces zostanie przerwany między zapisem dobrej kopii a publikacją głównego pliku, loader wybiera nowszy kompletny zestaw z kopii. Zachowuje status błędu lub odzyskania kopii, więc nie przedstawia tej sytuacji jako udanej publikacji. Pusty plik wcześniejszego błędu nie zasłania dobrej kopii.

Plik `.lock` chroni przed nakładającymi się importami. Jest usuwany po zakończeniu próby. Po twardym przerwaniu procesu może zostać; przed jego ręcznym usunięciem operator powinien sprawdzić zapisany PID i upewnić się, że import już nie działa. Importer nie usuwa sam cudzej blokady.

## Reguły wyboru i interpretacji

- Obszar jest taki sam jak walidator współrzędnych routingu. To bbox, nie administracyjna granica miasta.
- Przyjmujemy `Grupa=KMK` i rzeczywiste typy pasażerskie: autobusowy, tramwajowy, wspólny, ich odpowiedniki tymczasowe oraz perony. Odrzucamy m.in. wirtualne, historyczne i serwisowe, a także grupy prywatne/zawieszone. Jest to jawny, ostrożny zakres, nie twierdzenie, że wszystkie odrzucone obiekty są niedostępne.
- `validFrom` w przyszłości i `validUntil` równe/przed czasem importu wykluczają rekord. Niepoprawne daty także wykluczają. `null` oznacza brak daty w źródle. Loader dodatkowo sprawdza terminy przy odczycie, więc rekord wygasa również między importami.
- Identyfikator to `ztp-stop-<GlobalID>`, a gdy źródło nie ma poprawnego GlobalID: `ztp-stop-<OBJECTID>`. Ten drugi wariant nie gwarantuje ciągłości po ponownej publikacji całej warstwy przez dostawcę.
- Ławki i wiaty są liczbami przypisanymi do przystanku, nie osobnymi pomiarami punktów. Nie tworzymy z nich dokładnych punktów odpoczynku.
- Rodzaj krawężnika nie podaje jego wysokości. Nawierzchnia dotyczy peronu, nie pełnego dojścia. `wheelchair`, toaleta, szerokość i dostępność dojścia pozostają nieznane.
- Nowa warstwa nie modyfikuje OSM, nie scala automatycznie rekordów i nie zmienia grafu ani ograniczeń ORS. Nie zasila istniejących sugestii ławek.

## Kontrakt aplikacji

Miejsce zachowuje dotychczasowe pola `Place`, z `category: transport`, `placeType: transit_stop`, `coordinateKind: source-point`, `verifiedAt: null`. `sourceUrl` wskazuje konkretny rekord, a `sourceLabel` ZTP.

`municipalFacts`:

```ts
{
  stopCode: string | null;
  stopType: string | null;
  platformSurface: string | null;
  kerbType: string | null;
  benchesOutsideShelter: number | null;
  shelters: number | null;
  validFrom: string | null;
  validUntil: string | null;
}
```

`provenance` zawiera `datasetId`, `publisher`, `datasetUrl`, `recordUrl`, `recordId`, `objectId`, `recordUpdatedAt`, `fetchedAt`, `sourceUpdatedAt`, `termsUrl`, `attribution`, `verification: source-only` oraz surowe wartości wybranych pól `rawFacts`. Daty mogą być nieznane. Loader dopisuje `syncStatus`, `stale`, `lastSyncAttemptAt`. Nie należy prezentować `rawFacts` jako przetłumaczonej oceny dostępności.

```js
openStore(dbPath, placesPath, { municipalPath, now });
store.places();           // OSM i warstwa miejska, z dopasowaniem tożsamości stanowisk
store.place(id);          // również sprawdza wygaśnięcie ZTP
store.municipalStatus();  // success | error | missing, daty, liczniki, stale
store.municipalPlaces();  // tylko bieżące przystanki ZTP, bez czytania tabeli OSM
store.source;            // legacy metadane OSM i dodatkowe datasets[]
```

Brak `municipalPath` wybiera plik obok `placesPath`; `null` wyłącza warstwę, co jest przydatne w izolowanych testach. Loader obserwuje metadane głównego pliku i kopii (czas modyfikacji/zmiany, identyfikator i rozmiar), zachowując poprawny zestaw w pamięci przy błędzie. Dane starsze niż 48 h od udanej synchronizacji mają `stale: true`. Daty synchronizacji lub źródła wyprzedzające bieżący czas o ponad 5 minut dają błąd czasu i `stale: true`, a nie pozornie świeży wynik. Import odrzuca przyszłą datę zmiany warstwy lub używanego rekordu z takim marginesem na niewielką różnicę zegarów. Metadane sukcesu nie oznaczają świeżości wszystkich rekordów.

Miejskie obiekty nie są zapisywane do tabeli OSM `places`, dzięki czemu po usunięciu ze snapshotu nie wracają ze starego SQLite. Źródło OSM otrzymuje osobne `importedAt` i `snapshotAt`, nigdy fikcyjne `fetchedAt`.

## Łączenie stanowisk z OSM

Od 3 października po 14:40 UTC `place-fusion.mjs` łączy rekordy, jeśli znormalizowana nazwa wraz z numerem stanowiska jest identyczna, odległość nie przekracza 35 m i dopasowanie jest jednoznaczne z obu stron. Sama bliskość lub nazwa zespołu przystankowego nie wystarcza. Niejednoznaczne przypadki zostają oddzielne. API zwraca `sourceIds` i oba opisy pochodzenia; identyfikator OSM zapisany wcześniej nadal otwiera miejsce. Dane peronu pochodzą z ZTP, a opis dostępności z OSM. Żadne z tych dopasowań nie potwierdza oględzin w terenie. Wygaśnięcie lub usunięcie danych ZTP ponownie pokazuje sam rekord OSM. Wyszukiwarka stosuje to dopasowanie również do podpowiedzi adresowych.

Na bieżących plikach dopasowano 1935 par. Teatr Słowackiego ma cztery stanowiska zamiast ośmiu powtórzonych wyników.

## Weryfikacja

Finalny build web PASS. Trzy scenariusze miejskie przeszły w ostatnim zestawie 12/12 razem z ulubionymi i odpoczynkiem: prawdziwa karta Teatr Słowackiego 03 i routing ORS, zachowanie pochodzenia przez zapis miejsca/ponowne otwarcie/zapis planu, awaria z wcześniejszą kopią oraz awaria pierwszego importu bez miejskich kart. Dane testowe awarii nie zmieniały głównej bazy. Źródło i daty sprawdzono też ręcznie w przeglądarce na 4173. Dowody: `artifacts/municipal-recovery-report.json`, `municipal-live-source.png`, `municipal-source-outage-mobile.png`.

Cały backend po integracji: **90/90 PASS z RUN_ORS_TESTS=1**, bez pominięć. Poniższe mniejsze zestawy zachowano jako wcześniejsze etapy implementacji.

Trzynaście izolowanych testów potwierdza: pełne stronicowanie, bbox/status/typ/ważność, brak wnioskowania o dostępności, brak `Editor`, zachowanie kopii po awarii, odrzucenie niekompletnego importu i zmiany źródła w trakcie, upływ ważności bez restartu, odczyt kopii po uszkodzeniu, rozdzielenie OSM/ZTP w SQLite oraz blokadę równoległego importu. Dodatkowe regresje obejmują przerwanie publikacji po zapisie kopii, cofnięty zegar, przyszłe daty źródła, przerwanie transmisji na drugiej stronie oraz zapisane przyszłe/wygasłe terminy ważności i nieznane wartości. Rzeczywisty pierwszy import przeszedł z kodem 0, ale nie stanowi terenowej walidacji przystanków.

Pakiet adapter + API + wyszukiwanie + odpoczynek: 30 testów PASS, 1 test rzeczywistego ORS pominięty (graf i routing nie były zmieniane). Osobna instancja API na losowym porcie, z bazą w pamięci, zwróciła HTTP 200 dla wyszukiwania Teatr Słowackiego: 4 punkty ZTP i 4 OSM. Odczyt pojedynczego miejskiego miejsca również zwrócił 200. Łącznie loader udostępnił 30 945 miejsc. Głównego API podczas tej kontroli nie restartowano.

Pierwszy snapshot: 10 504 580 B; SHA-256 `10321a366a219f503984808e066a7aabe0895ac6dca70dde70f768403154b630`. Kopia `last-good` była identyczna. Kontrola wszystkich 3298 rekordów potwierdziła `wheelchair: unknown` i brak pola `Editor`.
