# Filtry mapy

Stan: 3 października 2026. Web/PWA. Przycisk „Filtry mapy” jest dostępny w górnej nawigacji, także na telefonie i w trakcie planowania trasy. W miejscu motta nad mapą znajduje się teraz liczba wyników i skrót do filtrów.

## Zasady działania

- Kategorie i kryteria miejsc działają łącznie. API filtruje cały katalog przed limitem 100 wyników; lista pokazuje do 80, mapa do 100 i grupuje pobliskie punkty. Licznik mapy ujawnia ograniczenie liczby wyświetlanych miejsc.
- „Dostępne toalety” ustawia kategorię toalet oraz wymaga dodatniej informacji o dostępności WC. Wyklucza jawne ograniczenia i sprzeczność z ogólną dostępnością obiektu. Nie oznacza audytu wejścia ani dopasowania do wymiarów konkretnego wózka.
- Dostępność dla wózka zachowuje cztery osobne wartości: dostępne, częściowo dostępne, niedostępne i brak danych. Brak danych nigdy nie spełnia dodatniego warunku.
- „Bezpłatne”: wyłącznie `fee=no`. „Dostęp ogólny”: `access=yes`, `public` lub `permissive`. Brak tagu dostępu nie jest traktowany jako publiczny. Bezpłatność nie usuwa ograniczenia tylko dla klientów.
- „Całodobowe”: wyłącznie jawne `opening_hours=24/7`, bez obietnicy faktycznego otwarcia w tej chwili.
- Ławki: osobny wybór typu oraz jawne `backrest=yes` i `armrest=yes`. Preset „Ławki z oparciem” wybiera kategorię plenerową, ławki i oparcie.
- Osobne przełączniki warstw: miejsca, aktywne bariery, miejsca odpoczynku, wejścia bez schodów i działające windy. Zgłoszenia są filtrowane według statusu i ważności. Nie aktualizują automatycznie dostępności pobliskiego obiektu. Ukrycie bariery na mapie nie zmienia routingu.
- Zmiana filtrów nie zmienia celu, przystanków ani obliczonej trasy. Miejsca są widoczne również w widoku trasy; można je ukryć przełącznikiem.
- Offline te same reguły filtrują zachowaną część katalogu. Interfejs ujawnia błąd pobrania, a licznik nie udaje wyniku z całej bazy. Zapis podręczny podstawowych miejsc nie jest nadpisywany wynikami z aktywnymi filtrami.

## Sprawdzone źródła

### OpenStreetMap

Katalog korzysta z lokalnego wyciągu OSM / Geofabrik z 1 października 2026. Zawiera 277 rekordów toalet; ogólne `wheelchair`: 105 `yes`, 10 `limited`, 42 `no`, 120 bez informacji. Nie jest to liczba audytowanych toalet ani wykaz ograniczony do granicy administracyjnej Krakowa.

- [OSM: wheelchair](https://wiki.openstreetmap.org/wiki/Key:wheelchair)
- [OSM: toilets:wheelchair](https://wiki.openstreetmap.org/wiki/Key:toilets:wheelchair)
- [OSM: amenity=toilets](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets)
- [OSM: access](https://wiki.openstreetmap.org/wiki/Key:access)
- [OSM: fee](https://wiki.openstreetmap.org/wiki/Key:fee)
- [OSM: amenity=bench](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dbench)

Importer zachowuje jawne `toilets:wheelchair=yes/no/limited` przed ogólnym `wheelchair`. Nieznanej wartości jawnego tagu nie zastępuje domyślnym dodatnim statusem. Dla samodzielnej toalety, bez szczegółowego tagu, może użyć `wheelchair`. Wspólna funkcja filtrująca dodatkowo wyklucza sprzeczne i częściowe deklaracje.

### Miasto Kraków

Sprawdzono [miejski wykaz toalet](https://krakow.pl/bezbarier/turystyka_sport_kultura/2780,artykul,toalety-ogolnodostepne.html), aktualizowany 15 września 2025, oraz [jego wersję PDF](https://krakow.pl/getPdf?dok_id=2780). Wykaz 65 obiektów opisuje wejście z poziomu 0, platformy, windy, pochylnie i schodołazy. Te sposoby dostępu nie są równoważne dla samodzielnego użytkownika wózka.

Sprawdzono też [konfigurację mapy MSIP](https://msip.um.krakow.pl/portal/sharing/rest/content/items/8274b2a015bc448ca27ad9e02e45d8eb/data?f=json). Warstwa `ZIW_WC_6227` deklaruje pola `nazwa`, `adres`, `typ`, `platnosc`, `godziny`, `przewij`, `dla_niep`, `udogodn`, `l_tt`, `rodzaj`, `data_imp`. Wskazany w niej endpoint rekordów `https://msip3.um.krakow.pl/server/rest/services/G_komunalna/ZIW_WC/MapServer/0` zwracał HTTP 404 podczas sprawdzania.

Dlatego miejski wykaz posłużył do oceny semantyki filtrów. Nie jest automatycznie połączony z punktami OSM. Filtry poziomu 0, przewijaka i typu urządzenia nie są pokazywane bez danych dla konkretnych punktów. Rozbudowa wymaga importu z datą i źródłem oraz sprawdzonego powiązania obiektów.

## Kontrakt API

`GET /api/places` zachowuje istniejące `q`, `category` i `limit`. Nowe opcje:

| Parametr | Wartości |
| --- | --- |
| `wheelchair` | `all`, `yes`, `limited`, `no`, `unknown` |
| `accessibleToilet` | `true`, `false` |
| `freeOnly` | `true`, `false` |
| `publicOnly` | `true`, `false` |
| `open247` | `true`, `false` |
| `placeType` | `all`, `bench` |
| `backrest` | `true`, `false` |
| `armrest` | `true`, `false` |

Powtórzone parametry, nieobsługiwane wartości i niepoprawne typy są odrzucane kodem 400. `shared/place-filters.mjs` współdzieli reguły między API a filtrowaniem podręcznego katalogu w przeglądarce.
