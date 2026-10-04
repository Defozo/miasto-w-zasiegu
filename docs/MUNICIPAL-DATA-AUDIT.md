# Audyt wykorzystania danych miejskich

Aktualizacja 4 października 2026: uruchomiono [automatyczny harmonogram ZTP i OSM](DATA-IMPORT-SCHEDULE.md). Poniższe wzmianki o ręcznych importach i braku harmonogramu opisują historyczny stan audytu z 3 października.

Stan bazowego audytu z 3 października 2026 r., po imporcie ZTP o 10:25 UTC. Aktualizacja po 14:40 UTC obejmuje dodatkowy import P+R i łączenie rekordów z OSM, opisane poniżej. Odczyty HTTP wykonano bez logowania i bez zapisywania zmian w usługach miejskich.

**Stan historyczny, 3 października przed 10:25 UTC:** w pierwszym audycie żaden osobny zbiór miejski nie zasilał aplikacji. `/api/health` o 10:21:44Z zwracało 27 647 miejsc; miejskie odczyty były wyłącznie próbkami. Następnie wykonano import 3298 przystanków ZTP. Poniższa macierz opisuje stan po integracji, a nie dawną lukę. Próbki toalet, adresów i muzeów nadal są tylko researchem, nie importem.

## Odpowiedź na pytanie o wszystkie dane

**Nie używamy wszystkich danych. Zintegrowane są przystanki KMK i parkingi P+R od ZTP.** Źródłowe rekordy pozostają oddzielne, a warstwa odczytu łączy jednoznaczne dopasowania z OSM. Liczby z porannego audytu poniżej są historyczne; nie należy sumować ich jako liczby unikatowych miejsc. Toalety ZIW/MSIP i adresy EMUiA nie są podłączone. Dane o modelach wózków są odrębnym źródłem, niezwiązanym z miejskimi pomiarami dostępności.

### Parking i łączenie danych, aktualizacja po 14:40 UTC

- Zaimportowano 10 rekordów z [warstwy Park and Ride](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Park_and_Ride/FeatureServer/0). Konkretny zbiór wskazuje [karta KMK](https://otwartedane.um.krakow.pl/zbiory-danych/komunikacja-miejska-w-krakowie-kmk). Obowiązują [warunki portalu](https://otwartedane.um.krakow.pl/warunki-wykorzystania-danych-udostepnianych-w-portalu): wskazanie Gminy Miejskiej Kraków, portalu, źródła i dat. Nie przypisujemy licencji CC.
- Import: `node scripts/import-municipal-parkings.mjs`. Zalecana częstotliwość operatora: co 24 h. Pierwszy import wykonano ręcznie, bez instalowania harmonogramu. Dane pobrano 2026-10-03T14:40:36.517Z, zmiana całego źródła: 2026-01-30T13:08:42.925Z. Data pobrania nie odmładza pomiarów. Sprawdzenie schematu, kompletności, tożsamości i daty źródła poprzedza podmianę pliku. Awaria zachowuje ostatnią poprawną kopię i oznacza błąd; po 48 h bez udanego importu dane są nieświeże. Żądanie użytkownika korzysta z lokalnego pliku.
- `server/place-fusion.mjs` dopasowuje P+R do pojedynczego obszaru parkingu OSM zawierającego punkt miasta lub jednoznacznej identycznej nazwy w promieniu 120 m. Wszystkie 10 obecnych rekordów znalazło dopasowanie. Przy wielu kandydatach rekordy pozostają odrębne. Oba źródła i rozbieżne liczby miejsc są widoczne. Obecność miejsc (`yes`) nie jest traktowana jak liczba miejsc.
- `scripts/import-parking-access.py` odczytuje ten sam PBF co parkingi. Grupuje pojedyncze stanowiska w obszarach i znajduje wspólne węzły OSM dróg/chodników z parkingami, osobno dla auta i ruchu pieszego. Uwzględnia ograniczenia dostępu i poziomy; nie łączy samą bliskością z drogą ani nie przyjmuje drzwi dowolnego budynku wewnątrz obszaru za wyjście z parkingu. Uruchom po `scripts/import-pois.py --parking-only --output server/data/parkings.json`. Wynik `server/data/parking-access.json` działa tylko ze zgodnym snapshotem parkingów. Po zmianie plików OSM trzeba przeładować API. Sam import nie przebudowuje grafu ORS.
- 41 346 rekordów OSM to 14 895 parkingów, 24 812 stanowisk i 1639 wjazdów. Po grupowaniu jest 21 284 odrębnych kandydatów, w tym stanowiska bez przypisanego obszaru. Opisane połączenia z drogą mają 1344 rekordy, z drogą pieszą 1638. Nie oznacza to audytu przejścia przez parking; przesiadka nadal ma status niepotwierdzony.
- Planner próbuje różnych opisanych wjazdów i wyjść; nie usuwa sąsiedniego parkingu tylko dlatego, że leży w odległości 30 m. Nie zmienia wymagań użytkownika. Błąd zwraca liczbę rzeczywiście sprawdzonych kandydatów, etap niepowodzenia, informację o niedokończeniu przeszukania i rozróżnia awarię usługi od braku drogi.
- Miejska warstwa miejsc dla osób z niepełnosprawnościami [ZDMK](https://msip3.um.krakow.pl/server/rest/services/Transport/ZDMK_MCA_POST_NIEPELN/MapServer/0) nadal zwracała 404 podczas audytu. Nie przedstawiamy jej jako zaimportowanej. P+R opisuje liczbę miejsc, nie wolne miejsca, wymiary ani ciągłość dostępnego dojścia.
- Testy i odczyty: `tests/backend/parking-data.test.mjs`, `tests/parking_access_test.py`, `scripts/check-parking-integration.mjs`. Dane testowe są izolowane od bazy mieszkańców. Plik `artifacts/parking-integration-check.json` zawiera faktyczny wynik kontroli, w tym ewentualne błędy tras, i nie zastępuje audytu terenowego.

Końcowy odbiór 2026-10-03T14:58:38Z: publiczne `https://miastowzasiegu.pl` zwróciło trzy warianty Długa 12 → Rynek Główny 1 oraz podróż przez P+R Kurdwanów do przystanku Kurdwanów P+R 01, bez zmiany profilu 68 cm / 6% / 2 cm. Wybrany osobno wjazd `osm-node-2443511334` nadal nie ma obliczalnego dalszego odcinka; odpowiedź 422 podaje teraz dokładnie tę przyczynę i jeden sprawdzony parking. Karta P+R na domenie zwraca oba identyfikatory źródeł, a suma SHA-256 publicznego pakietu aplikacji jest zgodna ze sprawdzonym lokalnym buildem. Usunięty komunikat o lokalnej wersji nie występuje w tym pakiecie. Dowód: `artifacts/public-parking-fix-check.json`.

Weryfikacja automatyczna: 176 testów backendu PASS, 2 testy oznaczone jako opcjonalne/live pominięte; odrębne próby rzeczywistych silników opisano wyżej. Dwa testy importu topologii PASS. Cztery scenariusze przeglądarkowe PASS po poprawieniu selektora testowego: komunikat i klawiatura na 1440/390 px, ponowienie po błędzie usługi, miejska karta P+R i brak powtórzeń stanowisk. Sprawdzono AXE w zmienionych obszarach, bez pełnego audytu czytnikami ekranu lub terenowej weryfikacji parkingów. Kod i dane do domeny trafiły podczas równoległej aktualizacji prowadzonej w zadaniu zgłaszania barier; odbiór powyżej sprawdza rzeczywisty stan, nie samą deklarację wdrożenia.

Pierwszy import ZTP był **ręczny**. Codzienna aktualizacja deklarowana przez portal i zalecenie importu raz dziennie nie oznaczają uruchomionego harmonogramu. Automatyczne pobieranie nie jest skonfigurowane. Szczegółowy kontrakt, zasady awarii i ograniczenia opisuje [MUNICIPAL-STOPS](MUNICIPAL-STOPS.md).

Nie jest to samo w sobie naruszenie briefu. Najnowszy opis wskazuje dopuszczalne publiczne źródła, nie nakazuje użycia każdego portalu ani każdego zbioru. Wymaga natomiast jasnego pochodzenia, aktualności i wiarygodności informacji oraz opisania aktualizacji i zachowania przy awarii, jeśli używamy danych miejskich.

Dowody wymagań:

- [Opis zadania](../official-2026-10-03/materials/d749aab48b0e2887.pdf.txt), linie 23–29 i 87–97: źródła, wiarygodność, warunki dostawców, aktualizacja i awaria.
- Ten sam plik, linie 154–175: Otwarte Dane Krakowa, MSIP, dane.gov.pl, OpenStreetMap, właściciele i użytkownicy jako możliwe źródła.
- [Manifest](../official-2026-10-03/materials/manifest.json): pobranie 2026-10-03T09:53:57Z, dwa różne dokumenty PDF (kryteria i regulamin), bez dedykowanego dumpu danych miasta. Nie utożsamiamy kompletnego pobrania dokumentów z kompletnym pobraniem miejskich danych.

## Macierz obecnego wykorzystania

| Źródło | Dostępne / sprawdzone | Pobrane lokalnie | Faktycznie używane | Aktualizacja i ograniczenie |
|---|---|---|---|---|
| OpenStreetMap / Geofabrik Małopolskie | PBF całego województwa | Tak, snapshot 2026-10-01T20:22:06Z | Graf ORS; 27 647 POI; 139 045 rekordów adresów i odcinków ulic | Ręczne uruchomienie skryptów; aktualizacja PBF nie przebudowuje automatycznie grafu |
| OpenFreeMap | Zewnętrzny styl i kafle | Brak własnej pełnej kopii kafli | Podkład webowej mapy | Dostęp sieciowy; to nie są miejskie pomiary dostępności ani nasz graf routingu |
| Zgłoszenia / dobre odkrycia | Własne API i SQLite | Tak, mechanizm trwałego zapisu | Przeszkody w routingu; informacje i odpoczynek na mapie | Przeszkody oceniane jako świeże przez 24 h; obserwacje mają terminy ważności. Nie jest to potwierdzenie urzędowe |
| Otwarte Dane Krakowa | Portal, katalog i rzeczywiste API sprawdzone | Przystanki ZTP i 10 rekordów P+R; pozostałe tylko próbki | Tak, dwa zbiory opisane powyżej | Portal jest katalogiem źródeł, nie jedną w całości zaimportowaną bazą |
| MSIP / ZIW | Katalog, działająca starsza usługa toalet i adresów, paczka adresowa HEAD 200 | Tylko próbki na potrzeby audytu; nie pobrano paczki adresowej | Nie | Część nowych linków 404; konieczne rozróżnienie danych OPEN DATA i warunków dalszego udostępniania usług |
| ZTP, przystanki KMK | Publiczny FeatureServer, metadane, rzeczywiste rekordy | 3298 rekordów, pierwszy import 2026-10-03T10:25:09.468Z; sukces 10:25:11.533Z | Tak: loader, `/places`, szczegóły, `/locations` i UI; odbiór web potwierdzony, zakres poniżej | Import ręczny, brak harmonogramu. Jest ostatnia poprawna kopia, status błędu/nieświeżości i filtrowanie okresu ważności przy odczycie. Nie zmienia ORS ani dostępności dla wózka |
| dane.gov.pl | Wymienione w briefie jako źródło uzupełniające | Brak dedykowanego importu | Nie | Nie przeprowadzono inwentaryzacji wszystkich krajowych zbiorów; nie jest konieczna do podstawowego scenariusza |
| Informacje właścicieli miejsc | Możliwe źródło z briefu | Brak odrębnego importu deklaracji dostępności budynków | Nie jako osobna warstwa faktów o miejscu | Wyszukiwanie danych producentów wózków nie zastępuje tej warstwy |

Dowody kodu i danych:

- [Importer POI](../scripts/import-pois.py), linie 82–90: źródło OSM, `verifiedAt: None`, surowe godziny i ograniczenia; `widthCm` jest ustawiane na `None`, nie importuje szerokości wejścia. Linie 95–109: lokalny PBF i jego metadane.
- [Importer adresów](../server/import-locations.py), linie 55–56 i 64–76: adresy OSM, niezweryfikowane wejścia, lokalny PBF. Są to 120 515 adresów i 18 530 odcinków nazwanych ulic, nie 139 045 unikatowych adresów.
- [Magazyn](../server/store.mjs), [loader miejski](../server/municipal-stops.mjs) i [wyszukiwarka](../server/locations.mjs): dane ZTP są oddzielną warstwą poza tabelą OSM. Wyszukiwarka zachowuje duży indeks OSM/adresów, lecz czyta bieżące przystanki przy każdym zapytaniu. Nie odpytuje wtedy serwera miejskiego. Usunięcie, zmiana lub wygaśnięcie przystanku nie wymaga restartu.
- [Konfiguracja ORS](../experiments/ors/config/ors-config.yml), linie 15–24: graf z Małopolska PBF, wysokość i profil wheelchair; [instrukcja przebudowy](../experiments/ors/README.md), linia 66.
- [Mapa](../web/src/CityMap.tsx), linia 93: `tiles.openfreemap.org/styles/positron`.
- [Backend](../server/index.mjs), linie 143–144: ORS + własne raporty + sugestie odpoczynku. [Routing](../server/routing.mjs), linie 90–95: błąd źródła nie daje fikcyjnej trasy.
- [Raporty](../server/store.mjs), linie 6–13, oraz [odpoczynek](../server/stops.mjs), linie 173–174: świeżość i filtrowanie obserwacji.
- Odczyt `server/data/places.json`: 14 019 ławek, 277 toalet, 258 parków; 1326 rekordów ma znane oznaczenie wheelchair; 0 ma `verifiedAt`, 0 ma `access.widthCm`. Ostatnie zero wynika także z decyzji importera, więc nie jest dowodem braku szerokości w całym OSM. Liczników nie należy przedstawiać jako pokrycia wszystkich rzeczywistych obiektów miasta. Wycięcie jest prostokątem, obejmuje też okolice Krakowa, pomija relacje.
- Odczyt lokalnego `/api/health` o 10:32:15Z: `routing: ready`, `database: ready`, `places: 30945`. `/api/places?category=transport&q=Teatr%20Słowackiego&limit=20` zwróciło HTTP 200, 4 miejsca ZTP i 4 OSM, status miejski `success`, `stale: false`, `activeNow: 3298`. `/api/locations` zwróciło oddzielne źródła oraz metadane `scope: address-base` i `placeSources`. To potwierdza uruchomione API; nie zastępuje odbioru przeglądarkowego.
- [PlaceEvidence](../web/src/PlaceEvidence.tsx) rozdziela datę zmiany rekordu, pobranie ZTP, wczytanie lokalnego OSM i stan pobranej mapy. Brak sprawdzenia terenowego jest jawny. Odbiór web potwierdził rzeczywistą kartę ZTP, zachowanie dat po awarii oraz rozróżnienie 0 i braku danych. Po przeglądzie dodano komunikat pierwszej awarii bez miejskich rekordów i zachowanie źródła przy konwersji miejsca na punkt trasy/zapisany cel.
- [VERIFICATION](VERIFICATION.md) potwierdza 90/90 testów backendu z rzeczywistym ORS, bez pominięć. Testy [adaptera](../tests/backend/municipal-stops.test.mjs) i [wyszukiwarki](../tests/backend/locations.test.mjs) obejmują awarię, zachowanie kopii, podmianę snapshotu i wygaśnięcie bez restartu. Nie uruchamiano ich ponownie w ramach tej aktualizacji dokumentu.
- Odbiór web ma osobne raporty: [pełny przebieg 53 testów](../artifacts/e2e-runs/2026-10-03T10-29-06-335Z-58821b28/runner-summary.json) zakończył się 51 PASS i 2 FAIL przy starej etykiecie przycisku profilu. Po poprawce ARIA i testów [pakiet 16/16](../artifacts/municipal-final-report.json) przeszedł. Po naprawach wykrytych w przeglądzie [końcowy pakiet 12/12](../artifacts/municipal-recovery-report.json) potwierdził 3 scenariusze miejskie, 6 zapisanych miejsc i 3 odpoczynku. Obejmuje komunikat pierwszej awarii, ponowienie i zachowanie pochodzenia celu. Nie jest to ponowne wykonanie całego zestawu 53 testów; wyników częściowo nakładających się pakietów nie sumujemy.

## Trzy zbiory o największej wartości

### 1. Przystanki KMK: pierwszy działający adapter

[Karta Otwarte Dane Krakowa](https://otwartedane.um.krakow.pl/zbiory-danych/komunikacja-miejska-w-krakowie-kmk) wskazuje dane ZTP i codzienną aktualizację. Prowadzi do [publicznej karty ArcGIS](https://ztpk-gmk-2.hub.arcgis.com/maps/73cfc1778d0d4305a643ef0d2cb13e1f) i [warstwy FeatureServer](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Przystanki_Komunikacji_Miejskiej_w_Krakowie/FeatureServer/0).

W pierwszym odczycie potwierdzono HTTP 200 i **3756 rekordów** całej warstwy miasta i aglomeracji. [Zapytanie licznikowe](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Przystanki_Komunikacji_Miejskiej_w_Krakowie/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json). To inny zakres niż bbox importera: w nim pobrano 3436 rekordów w 7 stronach i zachowano 3298. Odrzucono 38 nieobsługiwanych typów, 87 innych/prywatnych/zawieszonych grup i 13 rekordów z przyszłą ważnością. Próbka `Teatr Słowackiego 03`, kod `801-03`, punkt `[19.945091760464276, 50.06400786173191]`: peron z kostki, krawężnik `kassel-kerb`, 4 ławki poza wiatą, 1 wiata. Pola obejmują też typ i geometrię przystanku, `Grupa`, `validFrom`, `validUntil`, `EditDate`.

Warstwa deklarowała `dataLastEditDate = 2026-10-02T12:28:10.822Z`. To data ostatniej zmiany warstwy, nie audytu każdego przystanku. Próbkowany Gałczyńskiego 04 miał `EditDate = 2025-12-29T10:17:57.489Z`.

Warunki: [portalowe zasady ponownego wykorzystania](https://otwartedane.um.krakow.pl/warunki-wykorzystania-danych-udostepnianych-w-portalu) pozwalają na bezpłatne wykorzystanie z nazwą i adresem źródła oraz czasem wytworzenia i pozyskania, chyba że dany zbiór stanowi inaczej. Karta nie podaje dodatkowego ograniczenia; `licenseInfo` elementu ArcGIS jest pusty, więc nie przypisujemy wymyślonej licencji CC.

Zastosowanie: karta przystanku z konkretnymi faktami i opcją użycia punktu w planowaniu. Ławki przypisane są do przystanku, nie mają osobnych współrzędnych. Import nie tworzy z nich nowych punktów odpoczynku. Rodzaj krawężnika nie podaje jego wysokości ani gwarancji wjazdu do pojazdu. Wszystkie importowane rekordy zachowują `wheelchair: unknown`, brak szerokości i brak potwierdzenia terenowego. Pole `Editor` jest pominięte. Nie ma automatycznego scalania z OSM, zmiany grafu ORS ani gwarancji przejezdności dojścia.

### 2. Toalety ZIW / MSIP: największy przyrost informacji o dostępności

[Karta MSIP](https://msip.krakow.pl/dataset/3121) wskazuje ZIW jako właściciela. Nowy link z karty `msip3.um.krakow.pl/server/rest/services/G_komunalna/ZIW_WC/MapServer` zwrócił 404. Działa [starsza warstwa miejskiego serwera](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/WT_WC_2023/MapServer/0), HTTP 200, **50 rekordów**. Nazwa `WT_WC_2023` nie dowodzi daty aktualności treści.

[Odtwarzalna próbka dwóch rekordów](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/WT_WC_2023/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2&f=json) zawiera godziny, dni, sezonowość, rodzaj udogodnienia, opis dostępności, status, przewijak i płatność kartą:

| Punkt miejski | Fakty w źródle | Ograniczenie interpretacji |
|---|---|---|
| Dietla / Starowiślna, `[19.9457016, 50.0576668]` | wjazd z poziomu 0; całodobowo; przewijak | Nie jest to pomiar szerokości, działającego zamka ani stanu dzisiejszego |
| Sienna / Planty, `[19.9417591, 50.0597229]` | platforma; dostępność po stronie damskiej; 8–21 | Nie wolno skrócić tego do bezwarunkowego „dostępne” |

Konkretny brak w aplikacji: jej [punkt OSM Sienna](https://www.openstreetmap.org/node/274115139), ok. 5,7 m od miejskiego punktu, ma dostępność nieznaną. Miasto wnosi tu informacje, których obecna karta nie pokazuje. Bliskość uzasadnia kandydata do ręcznego powiązania, nie automatyczne uznanie identycznego wejścia.

[Tabela ZIW](https://ziw.krakow.pl/biezace-utrzymanie/szalety/) również publikuje udogodnienia i godziny. Nie znaleziono w odczytanych metadanych REST daty aktualizacji pojedynczego rekordu ani gwarantowanego harmonogramu. Nie podstawiać czasu pobrania jako daty oględzin. Nie kopiować i nie renderować surowego `zdjecia_html`; sam dostęp do fotografii nie ustala praw do zdjęć.

Warunki: nie potwierdzono osobnej swobodnej licencji tego zbioru. [Regulamin MSIP](https://msip.krakow.pl/?dok_id=228972) oraz [BIP o odmiennych zasadach](https://www.bip.krakow.pl/?dok_id=56559) ograniczają dalsze udostępnianie serwisów, w tym REST/WMS/WFS; przy ciągłym zorganizowanym udostępnianiu niekomercyjnym regulamin wymienia zgodę administratora. **Dostęp techniczny jest potwierdzony, prawo do docelowego sposobu redystrybucji trzeba ustalić przed uruchomieniem adaptera.** Do tego czasu bezpieczny zakres produktowy to wskazanie źródła użytkownikowi; audyt nie kontaktował się z administratorem.

### 3. Punkty adresowe EMUiA: poprawa wyszukiwania i identyfikacji

[Karta MSIP EMUiA](https://msip.krakow.pl/dataset/1492) oznacza zbiór jako OpenData i wskazuje paczki XLSX/SHP/DXF/JSON oraz WFS. [ZIP JSON](https://msip.um.krakow.pl/Dane/Adresy_JSON.zip): HEAD 200, 2 354 295 B, `Last-Modified: 2026-10-03T00:01:04Z`. Paczki nie pobierano w tym audycie. [Działająca starsza warstwa adresowa](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/Adresy_Ulice/MapServer/2) zwróciła rzeczywisty rekord: `adr_id=290`, Skotnica 9a, Kraków, 31-335, `[19.90103762592139, 50.10718851662859]`, z polem `aktualnosc`.

Zastosowanie: drugi indeks adresów z urzędowym identyfikatorem i nazwą ulicy. Nie oznaczać punktu adresowego jako dostępnego wejścia. Deduplikacja potrzebuje adresu, odległości i pochodzenia, nie samej nazwy. To może ograniczyć niejednoznaczności naszego indeksu OSM.

Warunki karty odsyłają do regulaminu MSIP, bez podanej standardowej licencji. [Nowa usługa pobierania](https://msip.krakow.pl/aktualnosci/324198,2053,komunikat,nowa_usluga_pobierania_danych_msip.html) potwierdza od czerwca 2026 paczki OPEN DATA bez logowania. Nie należy utożsamiać paczki danych z prawem do odsprzedaży lub osadzania całego serwisu mapowego. Przed integracją zachować warunki właściwe dla pobranej paczki i ustalić zakres ponownego wykorzystania. Data pliku i `aktualnosc` są dostępne; regularność publikacji nie została potwierdzona.

## Inne konkretne ustalenia

- [Lista muzeów miejskich](https://otwartedane.um.krakow.pl/zbiory-danych/lista-muzeow-miejskich-w-krakowie): [API](https://api.um.krakow.pl/opendata-kultura-lista-muzeow/v1/muzea-miejskie?%24first=2) HTTP 200 bez klucza, metadane wskazały 30 wierszy. Przykład: Muzeum Armii Krajowej, Wita Stwosza 12. Brak współrzędnych i danych o barierach; lista może uzupełnić nazwy i adresy, lecz sama nie rozwiązuje dostępności. Karta podaje aktualizację roczną, tabelę z datą 09.04.2024; [techniczne `last_refresh`](https://api.um.krakow.pl/opendata-kultura-lista-muzeow/v1/metadata) miało `2026-10-03T12:21:22.627` bez strefy. Nie utożsamiać tych dat. Odpowiedź z paginacją zawiera `nextLink` do hosta wewnętrznego: adapter musi korzystać ze znanego publicznego endpointu i kursora, nie ślepo pobierać dowolnego URL z odpowiedzi.
- [Parkingi dla osób z niepełnosprawnościami](https://msip.krakow.pl/dataset/3101): katalog deklaruje aktualizację codzienną, lecz podany nowy REST `msip3.um.krakow.pl/server/rest/services/Transport/ZDMK_MCA_POST_NIEPELN/MapServer/0` zwrócił 404. Nie przedstawiamy go jako gotowego, sprawdzonego źródła rekordów.
- [Komunikat MSIP o pracach](https://msip.krakow.pl/polecamy/339644,2224,komunikat,prace_serwisowe_na_srodowisku_msip_obserwatorium_od_30_09_2026.html), aktualizacja 02.10.2026, ostrzega o braku dostępu podczas prac od 30.09.2026. To kontekst awarii, nie dowód jej dokładnej przyczyny. Termin końca w treści ma literówkę roku, więc nie opieramy na nim automatycznego przywrócenia usługi.

## Wdrożone minimum i kolejne luki

1. **Przystanki ZTP są wdrożone i odebrane w web.** Importer zapisuje identyfikator, współrzędne, wybrane surowe wartości, źródło, datę rekordu, datę pobrania i warunki do osobnej warstwy. API i karta z faktami przeszły opisane sprawdzenia. Do późniejszego wykonania pozostają uruchomienie oraz monitoring codziennego importu przez operatora.
2. **Następnie toalety po ustaleniu zasad redystrybucji.** Ręcznie sprawdzić powiązanie kilku punktów demonstracyjnych, np. Sienna i Dietla. Zachować zastrzeżenie „po stronie damskiej” i rodzaj urządzenia. Warstwy OSM, miasta i obserwacji mieszkańców pozostają oddzielne. Pokazać konflikt zamiast nadpisywać wcześniejszy fakt etykietą „potwierdzono”.
3. **Synchronizacja atomowa i jawna awaria są wdrożone dla ZTP.** Znany host, limity rozmiaru/czasu, walidacja schematu i stronicowania, ostatnia poprawna kopia oraz status błędu chronią przed zastąpieniem dobrych danych pustym wynikiem. Testy obejmują przerwanie publikacji, cofnięty zegar i upływ ważności. Komunikaty UI sprawdzono zarówno z poprzednią kopią, jak i przed pierwszym importem. Dalszym zadaniem pozostaje odpowiedzialność operatora za nieudany import.
4. **Demonstracja jakości danych.** Jeden scenariusz braku danych OSM uzupełnionego miejską informacją, jeden z konfliktującą świeżą obserwacją i jeden z niedostępnym źródłem. Dane testowe tylko w testach; brak fikcyjnych obserwacji w zwykłej bazie.

Model ma już `provenance` i panel dat, lecz nadal na poziomie rekordu/zbioru, nie niezależnej historii każdego faktu. ZTP i OSM pozostają osobne; nie ma mechanizmu rozstrzygania ich sprzecznych opisów. To istotniejszy następny problem niż import wszystkich statystyk miejskich. [Warunki OSM](https://www.openstreetmap.org/copyright) nadal obowiązują dla istniejącego zbioru; dodanie danych miejskich nie zmienia ich automatycznie.

## Zakres wykonania audytu

Pierwszy audyt obejmował dokumenty konkursowe, manifest, importery, magazyn, routing, sugestie odpoczynku i mapę, lokalne liczniki oraz małe publiczne odczyty metadanych/próbek i HEAD paczki adresowej. Późniejszy etap wdrożeniowy wykonał rzeczywisty import ZTP. Aktualizacja dokumentu odczytała snapshoty, kontrakty API, panel pochodzenia i zapisane wyniki testów oraz sprawdziła działające lokalne API. Nie pobierała ponownie OSM ani ZTP, nie zmieniała danych użytkowników i nie uruchamiała wspólnych E2E. Końcowy stan odbioru wynika z osobno wykonanych raportów podlinkowanych powyżej. Bieżący pakiet jest zakończony; opis dalszych luk nie oznacza rozpoczęcia kolejnych funkcji.
