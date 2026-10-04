# API aplikacji

Paszporty obiektów, prywatne szkice, publikacje i weryfikacja domen: [kontrakt i ograniczenia](../docs/PLACE-PASSPORTS.md). Żądania `/api/place-passports` i `/api/mobility-presets` mają limit 128 KiB, `/api/equipment/research` 9 MiB (zdjęcie do 6 MB przed base64), `/api/report-photos` 6 MiB, pozostałe 16 KiB.

## Mapa, zestawy i podróże

- `GET /api/mobility-presets`, `PUT /api/mobility-presets`: dokument `{presets, activePresetId, usesCar, version}`. Zapis wymaga `expectedVersion` i respektuje `expectedUserId`. Do 12 zestawów: identyfikator, nazwa, `kind` (`manual`, `power`, `walker`, `stroller`, `walking`), `profile`, `equipment`. Balkonik używa profilu tras pieszego z osobnymi ograniczeniami. Stary profil migruje przy odczycie, a `/api/profile` jest zgodnym widokiem aktywnego zestawu. Konflikt zwraca 409. Zestawy gościa pozostają na urządzeniu, bez automatycznego importu do konta.
- `POST /api/equipment/research`: `kind`, `query` albo `image` (data URL JPEG/PNG/WebP), `clientId`. Zwraca 202 i identyfikator zadania. `GET /api/equipment/research/:id?clientId=...` zwraca `searching`, `needs_choice`, `complete`, `not_found` lub `failed`. Konto widzi własne zadania; anonimowe zadanie wymaga losowego `clientId`. Zadania są w pamięci procesu, ważne 30 minut, restart je unieważnia. Maksymalnie 2 jednocześnie i 20 prób na godzinę na konto/IP.
- Edytor webowy wysyła dodatkowo `conversational: true`. W tym trybie `query` może zawierać do 800 znaków swobodnego opisu. Wynik zawiera `messages`, `suggestions`, `identifiedKind` i `canApply`; status `needs_reply` oznacza pytanie uzupełniające. `POST /api/equipment/research/:id/messages` z `clientId` i `text` kontynuuje rozmowę; `retry: true` ponawia nieudaną odpowiedź bez dopisywania tej samej wiadomości. Własność sesji jest sprawdzana także dla odpowiedzi, równoległe tury są odrzucane, obowiązuje wspólny limit 20 wywołań na godzinę i 16 wiadomości użytkownika na rozmowę. Kolejna tura przedłuża ważność o 30 minut. Historia pozostaje w pamięci serwera i jest wysyłana do AI wraz z wcześniej udokumentowanymi ustaleniami. Przeglądarka przechowuje tylko identyfikator zadania i jego powiązanie z zestawem, bez treści rozmowy i zdjęcia.
- Asystent pyta o niejednoznaczny model, rozmiar lub sprzeczną kategorię. Pytanie i proponowane odpowiedzi tworzy LLM; wybór podpowiedzi i wpisanie tekstu korzystają z tej samej kontynuacji. Parametry wymagają zatwierdzenia w karcie wyniku. Szerokość nieznanego wariantu, zakres lub konflikt nie wypełniają pojedynczej wartości. Zmiana wariantu zastępuje wcześniej zastosowaną w tej sesji szerokość z dokumentacji, zachowując wartość wpisaną ręcznie. Odczyt AI nie jest audytem egzemplarza. Poprzedni kontrakt bez `conversational` pozostaje dostępny dla Androida.
- Zdjęcie jest dekodowane, zmniejszane i kodowane ponownie bez EXIF przed przekazaniem do Responses API. Nie trafia na dysk serwera, do publicznego katalogu ani logów aplikacji. Rozpoznanie zwraca kandydatów bez zgadywania wymiarów. Dokumentacja wymaga osobnego wyszukania i zatwierdzenia w edytorze. Własne pomiary zachowują pierwszeństwo, zakresy i sprzeczności nie wypełniają pojedynczej szerokości. Operator musi uwzględnić warunki przetwarzania dostawcy AI; `store:false` nie jest deklaracją zerowej retencji dostawcy.
- `GET /api/places` przyjmuje `bbox=west,south,east,north`, `near=lon,lat`, `placeType=parking`, `hideUnknown=true` (brak deklaracji dostępności) oraz `stepFree=true` (jawna informacja o wejściu bez stopni). Obszar filtruje przed limitem, punkt odniesienia ustala kolejność. Bez `near` używany jest środek obszaru, a bez obu parametrów dotychczasowe centrum Krakowa.
- `POST /api/journeys`: kontrakt `/api/route` oraz `mode:'car'`, opcjonalnie `parkingId`, `needsRampSpace`. Wynik ma do 3 `alternatives` z `parking`, `drive`, `onward`, `transfer`, `warnings`; niepasujące próby są w `unavailable`. Odcinek samochodowy używa `ORS_DRIVE_BASE_URL` (domyślnie `http://127.0.0.1:18083/ors`) i `driving-car`. Dalsza trasa używa dotychczasowego ORS. Opisane wjazdy są preferowane, a wynik uwzględnia długość dalszego odcinka. Połączenie przez parking bez danych pozostaje `unknown`, nawet przy dwóch obliczonych trasach. Brak przejazdu nie łagodzi wymagań.
- Import `scripts/import-pois.py --parking-only --output server/data/parkings.json` czyta lokalny PBF OSM. Zapis atomowy pozostawia ostatnią poprawną wersję przy przerwaniu importu. Importowany rekord zachowuje OSM URL, datę zmiany i pochodzenie migawki; dane podlegają ODbL. Automatyczna aktualizacja z nowego PBF: niedziela 04:40 Europe/Warsaw, przez `scripts/run-data-imports.py osm`. Wszystkie warstwy OSM są publikowane wspólnym wskaźnikiem po walidacji i sprawdzeniu API; szczegóły w [DATA-IMPORT-SCHEDULE](../docs/DATA-IMPORT-SCHEDULE.md). Awaria źródła nie usuwa migawki. Rekordy importu obejmują również pojedyncze stanowiska i wjazdy; ich liczba nie jest liczbą odrębnych parkingów.

Obie platformy zapisują plan i kopię użytych potrzeb przed otwarciem oficjalnego Google Maps URL. Po powrocie wymagają potwierdzenia początku dalszej trasy. Web zatrzymuje prowadzenie po ukryciu strony. Android używa dotychczasowej usługi GPS. Nowe zestawy i zdjęcia nie zmieniają zasad zgody na rejestrowanie przejazdu.

Filtrowanie katalogu miejsc przed ograniczeniem wyników: [kontrakt i źródła filtrów mapy](../docs/MAP-FILTERS.md).

Wymaga Node 24 i Express 5 z głównego `package.json`.

```powershell
node server/index.mjs
# Osobna konsola, testy wraz z działającym ORS:
$env:RUN_ORS_TESTS='1'
node --test tests/backend/*.test.mjs
```

Domyślnie API słucha wyłącznie `127.0.0.1:3081`, ORS jest pod `http://127.0.0.1:18082/ors`. Zmienne: `PORT`, `HOST`, `ORS_BASE_URL`, `DB_PATH`. `createApp({dbPath, placesPath, locationsPath, orsBase, fetchImpl, mountRoutes})` służy do testów. Moduł eksportuje także `app`; import nie uruchamia portu i tworzy tę instancję w pamięci, aby nie zmieniać rzeczywistej bazy w testach. Bezpośrednie `node server/index.mjs` używa trwałego pliku `server/data/app.sqlite` z trybem WAL. W Node 24 moduł `node:sqlite` wyświetla ostrzeżenie o statusie eksperymentalnym. Rozszerzenia dostają `context={db,store,auth,getUser}` przez `mountRoutes(app,context)` przed obsługą 404; kontekst jest też w `app.locals.context`. `getUser(req)` działa synchronicznie i zwraca użytkownika lub null.

Ten punkt wejścia uruchamia deweloperskie API. Publiczny serwer i reverse proxy opisuje [wdrożenie](../docs/PUBLIC-DEPLOYMENT.md). Aplikacja korzysta z Clerk; pełne zaplecze moderacji jest elementem planowanego stałego pilotażu. [Konfiguracja OAuth, sesje i migracja](../docs/AUTH.md). Bez kluczy dostępny jest tryb gościa. Konto nie potwierdza prawdziwej tożsamości ani uprawnień do obiektu; publiczna nazwa pochodzi od użytkownika. Gość może dodać i rozwiązać anonimowe zgłoszenie. Zgłoszenie dodane po zalogowaniu może rozwiązać tylko jego autor; serwer przypisuje właściciela i ignoruje przesłane `userId`. Odpowiedź publiczna zawiera `isMine`, bez identyfikatora autora. Próba startu z `HOST` spoza loopback kończy się błędem, chyba że jawnie ustawiono `ALLOW_REMOTE_ACCESS=1`. Ta opcja nie dodaje TLS ani moderacji i nie powinna służyć do publikowania demonstracji w internecie. Nie uruchamiaj drugiej kopii API na tym samym porcie.

## Kontrakt

- `GET /api/health` → `{status:'ok',routing:'ready'|'unavailable',database:'ready',places,timestamp}`. Zdrowie bazy nie jest potwierdzeniem gotowości ORS.
- `GET /api/places?q=&category=&limit=` → `{places,total,source,municipalData}`. Limit 1–100, domyślnie 60. Najpierw dokładne dopasowanie nazwy, potem początek/nazwa/opis; wewnątrz grup według odległości od Rynku. Bez zapytania według odległości. Kategorie: `culture`, `food`, `toilet`, `transport`, `outdoors`. Wyszukiwanie ignoruje wielkość liter i polskie znaki. `source.datasets` wymienia źródła, `municipalData` podaje wynik i daty ostatniej synchronizacji ZTP. Każdy rekord zachowuje własne pochodzenie.
- `GET /api/places/:id` → jeden obiekt miejsca lub 404.
- `GET /api/locations?q=&limit=8` → `{locations,total,source}`. Minimum 2 znaki, limit 1–20. Rzeczywiste adresy, ulice i miejsca z lokalnego importu; numery domów są dopasowywane jako całe wartości, bez dopasowania `12` do `120`.
- `GET /api/wheelchairs` → `{wheelchairs,summary}`. 13 rzeczywistych porównań z wcześniejszego eksperymentu; zachowane rozbieżności producent/GKV. `widthCm` jest liczbą tylko dla jednoznacznej wartości skalarnej ze statusem `match`; zakresy, formuły i konflikty nie stają się automatycznym profilem.
- `GET /api/reports` → `{reports}`.
- `GET /api/report-photos/config` → dostępność analizy. `POST /api/report-photos` przyjmuje pomniejszony `image` jako data URL JPEG/PNG/WebP, losowy `clientId` i `expectedUserId`; zwraca 202. `GET /api/report-photos/:id?clientId=...` udostępnia prywatny wynik przez 30 minut, wyłącznie w tym samym koncie i sesji formularza. Analiza korzysta z `OPENAI_API_KEY` i opcjonalnego `REPORT_VISION_MODEL` (domyślnie `gpt-6.1-sol`). Limit: 2 równolegle, 10/IP/h i 100/h łącznie. Zdjęcie nie jest publikowane ani zapisywane na dysku. GPS odczytuje przeglądarka i nie przekazuje go modelowi. To API nie tworzy zgłoszenia.
- `POST /api/reports` → obiekt zgłoszenia, status 201.
- `POST /api/reports/:id/resolve` → zaktualizowane aktywne zgłoszenie; powtórzenie daje 409 `REPORT_ALREADY_RESOLVED` i nie zmienia daty rozwiązania.
- `GET /api/community` → `{stats:{places,reports,activeReports,resolvedReports},recentReports,notice}`. Bez sztucznych użytkowników, głosów i zgłoszeń.
- `POST /api/route` → `{routeId,geometry,distanceM,durationS,steps,warnings,source}`.

Przykład miejsca:

```js
{
  id: 'osm-node-...', name: 'nazwa z OSM', category: 'culture',
  coordinates: [19.94, 50.06], description: 'opis z OSM lub etykieta kategorii',
  address: 'adres z OSM albo jawny brak adresu',
  access: {wheelchair:'unknown', widthCm:null, surface:null, toilet:'unknown', entranceNotes:'...'},
  sourceUrl: 'https://www.openstreetmap.org/node/...', verifiedAt:null,
  sourceLabel:'OpenStreetMap · bez audytu terenowego', osmUpdatedAt:'...'
}
```

`access.wheelchair` i `access.toilet` to `yes|limited|no|unknown`. `verifiedAt:null` oznacza brak audytu terenowego; data modyfikacji OSM nie jest datą sprawdzenia dostępności. `provenance` rozdziela zmianę rekordu, import i stan mapy. Rekordy ZTP mają oddzielne `municipalFacts` i datę pobrania. [Kontrakt, warunki i aktualizacja miejskich przystanków](../docs/MUNICIPAL-STOPS.md). Opcja `createApp({municipalPath})` pozwala wskazać snapshot; `null` wyłącza miejską warstwę w testach.

Żądanie trasy:

```json
{"start":[19.93931,50.06218],"end":[19.94123,50.06464],"profile":{"widthCm":90,"maxIncline":6,"maxKerbCm":6,"avoidUnpaved":false},"avoidReports":true}
```

Każde pole profilu jest opcjonalne. Przykład jawnie podaje szerokość 90 cm; **brak szerokości nie ma wartości domyślnej**: `profileApplied.widthCm=null`, parametr `minimum_width` nie jest wysyłany do ORS, a odpowiedź zawiera ostrzeżenie. Pozostałe wartości przykładu są domyślne. Podana szerokość 30–200 cm, nachylenie 0–15% jako liczba całkowita, krawężnik 0–20 cm. Nachylenie podawane jest w procentach, nie w stopniach. Punkty muszą leżeć w prostokącie Krakowa i okolicy, odległość między nimi maksymalnie 20 km. ORS dopasowuje je do sieci w promieniu 30 m. Zwracane kroki: `{instruction,distanceM,wayPoints:[startIndex,endIndex]}` dla nieuproszczonej geometrii. `source` zawiera parametry rzeczywiście użyte, dopasowane końce trasy, odległości przesunięcia, datę OSM i identyfikatory ominiętych zgłoszeń.

Opcjonalne `waypoints:[[lon,lat],...]` zawiera do 5 **punktów pośrednich**, bez startu i celu. Serwer przekazuje `[start,...waypoints,end]` do jednego żądania ORS i zachowuje kolejność. Limit 20 km dotyczy sumy odległości prostych między kolejnymi punktami. `source.snappedCoordinates` i `snapDistancesM` obejmują wszystkie punkty. Kroki mają globalne indeksy w wynikowej geometrii. Opcjonalne `profile.mobility` wybiera osobny model czasu dla `manual|power|stroller|walking`; geometria nadal używa profilu ORS wheelchair. Brak danych kalibracji pozostawia czas ORS. Wewnętrzne ostrzeżenia silnika są zachowane w `source.engineWarnings`, komunikaty `warnings` są opisane po polsku.

Schody są wykluczone, `allow_unsuitable=false`, `surface_quality_known=false`. `avoidUnpaved` ustawia `surface_type:cobblestone` i `track_type:grade2`, zachowując utwardzone powierzchnie wraz z klasą 1. Bez tej preferencji wysyłamy `surface_type:any`, bez ukrytego filtra klasy ani równości. Brak danych OSM nadal może przepuścić odcinek; ostrzeżenia mówią o tym jawnie. API nie dopasowuje automatycznie profilu na podstawie katalogu wózków ani nie obiecuje przejazdu przez wszystkie drzwi. [Semantyka i regresje](../docs/ROUTING.md).

Zgłoszenie:

```json
{"kind":"obstacle","coordinates":[19.939976,50.0630515],"description":"Przejście zablokowane rusztowaniem"}
```

`kind` to `obstacle|kerb|surface|width|lift|steps|ramp|entrance|rest_place|toilet`, opis ma 3–800 znaków. `geometry` przyjmuje GeoJSON Point, LineString lub Polygon z jednym pierścieniem. Można podać wymiary, sposób pomiaru, dokładność lokalizacji, stronę ulicy, znaczenie obserwacji, trwałość i datę końca. Są to deklaracje autora, nie niezależny audyt. Starsze klienty z samym `coordinates` pozostają obsługiwane jako orientacyjne punkty.

Zgłoszenie przygotowane ze zdjęcia podaje `inputMethod: 'photo-ai'` i wymaga `photoReviewed: true`. `locationSource` może mieć wartość `photo-gps`, `browser` albo `manual`. Autor sprawdza `observedAt`; czas przesłania zdjęcia nie stanowi dowodu aktualności. Wynik modelu nie dostarcza wymiarów ani współrzędnych. Formularz zachowuje pomiary jako nieznane, dopóki człowiek ich nie poda.

Stałe elementy nie wygasają po dobie; po 90 dniach wymagają ponownego sprawdzenia. Stany tymczasowe domyślnie wygasają po 24 h, awaria windy po 4 h. `PUT /api/reports/:id` zapisuje poprawkę autora; `POST /api/reports/:id/feedback` przyjmuje `confirm` lub `dispute`. Sprzeczność wstrzymuje automatyczne omijanie do poprawki, a historia pozostaje widoczna.

Automatyczne omijanie wymaga konkretnej geometrii lub dopasowania do przejścia OSM. Liniowy krawężnik jest przeszkodą dla trasy, która go przekracza; nie blokuje spaceru wzdłuż chodnika. Wysokość krawężnika i szerokość są porównywane z profilem tylko przy zadeklarowanym pomiarze. Pozostałe zgłoszenia pozostają informacją do oceny. `accessibility.events` zawiera uporządkowane fakty i źródła wzdłuż trasy, a `coverage` wskazuje znane i nieznane odcinki nawierzchni.

`GET /api/accessibility?bbox=west,south,east,north&kinds=kerb,steps,lift,entrance,path` zwraca maksymalnie 1500 elementów z jawną informacją o ograniczeniu. Warstwa pochodzi z `scripts/import-accessibility.py` i indeksu SQLite. `POST /api/places/:id/research` uruchamia odczyt strony obiektu, a `GET /api/place-research/:id` zwraca wynik ze źródłami. Dane Google prezentuje osobny widget. [Przepływ danych, warunki i ograniczenia](../docs/accessibility-data-flow.json).

Nie ma zastępczej prostej linii ani poluzowania wymagań po błędzie ORS. Błędy: `{error:{code,message,details?}}`; 400 walidacja, 404 brak rekordu, 422 `NO_ROUTE`, 429 zajęte obliczenia, 503 niedostępny ORS, 504 timeout, 502 nieprawidłowa odpowiedź silnika. Body do 16 KiB, odpowiedź ORS do 2 MiB, maksymalnie 4 równoległe obliczenia. Całość ma budżet 30 s i do 3 zapytań uwzględniających nowe przeszkody przy objeździe; pojedynczy odczyt do 15 s lub pozostałego budżetu.

## Dane i odtworzenie importu

```powershell
.\experiments\ors\.venv\Scripts\python.exe -m pip install osmium==4.3.1
.\experiments\ors\.venv\Scripts\python.exe scripts/import-pois.py
```

Źródłem jest pobrany wcześniej `experiments/ors/input/malopolskie-latest.osm.pbf`. Liczba rekordów zależy od daty i obszaru danych; nie oznacza liczby wszystkich miejsc w granicach administracyjnych ani unikatowych fizycznych obiektów. Relacje nie są importowane. Dla way `coordinateKind='representative-center'` oznacza środek prostokąta obejmującego jego węzły, nie potwierdzone wejście; uwaga jest także w `access.entranceNotes`. Wyszukiwanie obejmuje m.in. Sukiennice `osm-way-23256528` i Wawel `osm-way-785550415`. Wynik `server/data/places.json` zachowuje źródło i atrybucję `© OpenStreetMap contributors`, licencja ODbL. Miejsca są upsertowane do SQLite przy starcie. Import nie zmienia zgłoszeń ani grafu ORS.

## Testowanie

[Instrukcja testowania](../docs/TESTING.md) opisuje uruchamianie backendu, izolację baz i opcjonalne sprawdzenie rzeczywistego ORS. Wyniki zależą od wersji kodu i danych. Testy z adapterem tożsamości nie są dowodem rzeczywistego OAuth, a syntetyczne zgłoszenia muszą pozostawać w osobnej bazie.

## Konta i wspólny profil

Każda mutacja `/api` może zawierać `expectedUserId`. Jeśli pole jest obecne, serwer wymaga zgodności z bieżącym kontem albo `null` dla gościa. Przy zmianie konta w innej karcie zwraca 409 `ACCOUNT_CHANGED` przed zapisem. Android z Bearer może pomijać pole. Kontrola wersji profilu działa niezależnie.

- `GET /api/auth/config` → `{provider:'clerk',configured,publishableKey}`. Zawiera wyłącznie klucz publiczny, nigdy sekret.
- `POST /api/auth/register` i `POST /api/auth/login` → 410 `USE_CLERK`. Konta i logowanie obsługuje Clerk.
- `POST /api/auth/logout` → `{ok:true}`, unieważnia bieżącą sesję.
- `GET /api/auth/me` → `{user:null|{id,email,displayName},profile:null|Profile,profileVersion}`.
- `PUT /api/profile {profile,expectedVersion}` → `{profile,profileVersion}`. Atomowa zmiana wersji; 409 `PROFILE_CONFLICT` zawiera `error.details={profile,profileVersion}`.

Profil przechowywany na koncie zachowuje tekstowe pola formularza:

```json
{"mobility":"manual","widthCm":"","maxIncline":"6","maxKerbCm":"6","avoidUnpaved":false}
```

`widthCm:""` oznacza brak pomiaru. W żądaniu trasy wartości liczbowe pozostają liczbami, a nie stringami. Web i Android wysyłają `Authorization: Bearer <JWT Clerk>`. Weryfikacja odbywa się przed kontrolą `expectedUserId`; dalsze moduły nadal używają synchronicznego `getUser(req)`. Stare cookie i hasła nie są akceptowane. Szczegóły konfiguracji, ograniczeń i izolowanych testów opisuje [AUTH.md](../docs/AUTH.md).

## Historia i indywidualny czas

`POST /api/trips` wymaga konta i jawnego `consent:true`:

```json
{"routeId":"opcjonalny-id-z-odpowiedzi-trasy","distanceM":1000,"durationS":1000,"completed":true,"feedback":"passable","profile":{"mobility":"manual","widthCm":"","maxIncline":"6","maxKerbCm":"6","avoidUnpaved":false},"consent":true}
```

Odpowiedź 201: `{trip,learning}`. `feedback` to `passable|difficult|blocked`. `GET /api/trips/me` zwraca ostatnie 100 wpisów i `total`; limit konta 2000 wpisów. `DELETE /api/trips/me` usuwa całą własną historię i jej kalibrację. `GET /api/learning/me` zwraca `{sampleCount,candidateCount,ready,secondsPerMeter,durationModel,minimumSamples:3,profile,quality,...}`. `DELETE /api/learning/me` wyłącza obecne wpisy z uczenia, zachowując historię. Kolejne nowe przejazdy mogą tworzyć nowy model.

Model używa wyłącznie prywatnych przejazdów tej osoby z identycznym znormalizowanym profilem. Wymaga minimum 3 zaakceptowanych przejazdów: ukończonych, `passable`, dystans 100–20000 m, czas 60–14400 s, 0,25–10 s/m. Bierze ostatnie 20 kwalifikujących się próbek, odrzuca wartości odległe od mediany o więcej niż max(3×MAD, 50% mediany), następnie EWMA z wagą 0,25. Pojedynczy identyfikator trasy można zapisać raz na konto. Jest to heurystyka dla czasów zadeklarowanych przez użytkownika, bez weryfikacji GPS po stronie serwera. Nie dowodzi prawdziwego przejazdu i nie służy do publicznego rankingu. Nie uczy przejezdności, nie zmienia ograniczeń ani geometrii i nie usuwa ostrzeżeń. Nie zapisuje współrzędnych, śladu GPS ani geometrii przejazdu. Dane są przypisane do konta i nie są anonimowe; model nie agreguje innych osób. Spersonalizowana odpowiedź zawiera `source.durationModel='personal-median-ewma-v1'`, `baseDurationS`, `secondsPerMeter` i liczbę próbek; bez gotowego modelu `durationModel='ors'`.

## Import adresów

```powershell
.\experiments\ors\.venv\Scripts\python.exe server/import-locations.py
```

Import odczytuje adresy i odcinki ulic z PBF w określonym prostokącie. Liczba rekordów nie oznacza liczby budynków ani adresów wyłącznie w granicach Krakowa. Dane trafiają do `server/data/locations.json`. Wymaga osmium 4.3.1; nie odpytuje publicznego geokodera. Zachowuje źródłowe `addr:street|addr:place`, `addr:housenumber` i ewentualne `addr:city`, bez dopisywania numerów lub miasta. API uzupełnia wyniki rzeczywistymi POI oraz scala sąsiednie segmenty ulic i bliskie duplikaty adresów.

Wynik lokalizacji: `{id,label,coordinates,kind:'address'|'place'|'street',precision:'address'|'approximate',sourceLabel,sourceUrl,coordinateKind?}`. `precision='address'` oznacza dopasowanie adresu, **nie potwierdzone dostępne wejście**. Adres obiektu way ma reprezentatywny środek obiektu; ulica punkt jej segmentu, POI swój punkt reprezentatywny. Dostępne wejście i stronę ulicy nadal trzeba ustalić niezależnie. Źródło: © OpenStreetMap contributors, ODbL.

## Przerwa po drodze

`POST /api/route` zachowuje dotychczasowy kontrakt i dodatkowo zwraca `stopSuggestions` (0–6 wyników). Nie wykonuje dodatkowych zapytań do silnika tras. Wynik ma pola `{id,kind,point,distanceFromRouteMeters,sourceLabel,sourceUrl,dataUpdatedAt,observedAt,validUntil,details,restrictions,warnings}`. `kind` to `bench|toilet|rest_place`; `point` jest gotowym `LocationPoint` z przybliżonym położeniem. `restrictions` zawiera znane ograniczenia dla klientów, wymagane zezwolenia, inne warunki dostępu i ograniczoną dostępność na wózku. Pusta tablica nie potwierdza braku ograniczeń.

Wyszukiwanie uwzględnia pełne segmenty wynikowej geometrii w promieniu 200 m. `distanceFromRouteMeters` jest odległością geometryczną, nie długością dojazdu ani dodatkowej trasy. Pomijane są centra obszarów, `access=private/no`, jawne `wheelchair=no` oraz przeterminowane i wycofane obserwacje. Nie proponuje się ponownie punktów do 15 m od początku, istniejących przystanków i celu. Do sześciu wyników wybierane są najpierw maksymalnie dwa każdego rodzaju, a wolne miejsca uzupełniają kolejne najbliższe. Dodanie przystanku wymaga ponownego wyznaczenia trasy i nie potwierdza dostępności samego miejsca.

Import z lokalnego PBF zachowuje `accessRestriction`, `openingHours`, `fee`, `placeType` oraz `bench.backrest/armrest`. Brak nazwy toalety daje neutralne „Toaleta”. Nienazwane ławki nie zajmują domyślnej listy Odkrywaj ani podpowiedzi adresów; są dostępne w sekcji odpoczynku oraz po jawnym wyszukaniu ławek lub wybraniu kategorii na zewnątrz. W tym ostatnim widoku pozostałe miejsca mają pierwszeństwo. `dataUpdatedAt` oznacza zmianę obiektu w mapie, nie kontrolę terenową. `observedAt` i `validUntil` dotyczą oddzielnej obserwacji mieszkańca.

## Dokumentacja modeli spoza katalogu

`GET /api/wheelchairs/discoveries?q=` zwraca ukończone wyniki. `POST /api/wheelchairs/search {query}` rozpoczyna zadanie albo zwraca istniejący wynik. `GET /api/wheelchairs/search/:id` zwraca status `searching|complete|not_found|failed`, komunikat i ewentualny model. Cache wyników: 30 dni; brak wyniku: godzina. Maksymalnie dwa równoległe wyszukiwania i sześć nowych żądań na IP na godzinę.

Asystent używa OpenAI Responses i web search. Parametry muszą wskazywać odwiedzony dokument. API zachowuje cytaty, źródła, wariant i datę. Zakresy i nierozstrzygnięte konfiguracje nie stają się jedną szerokością. Status `discovered` nie oznacza fizycznego pomiaru. Wymagany `OPENAI_API_KEY`; lokalnie uruchom `psst --global OPENAI_API_KEY -- node server/index.mjs` lub główny skrypt startowy. E2E wstrzykuje implementację bez połączenia z dostawcą.

Podstawa integracji: [Responses API](https://platform.openai.com/docs/api-reference/responses), [web search](https://platform.openai.com/docs/guides/tools-web-search). Gra korzysta ze wspólnej bazy i kont; kontrakty opisuje [GAME.md](../docs/GAME.md).
