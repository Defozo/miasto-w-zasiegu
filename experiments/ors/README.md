# Próba ORS na całej Małopolsce

Wykonano 3 października 2026. Lokalny ORS 10.0.1 z profilem `wheelchair` zaimportował cały plik Małopolski, zbudował graf z danymi wysokościowymi i obsłużył rzeczywiste żądania tras. Serwer jest dostępny pod `http://127.0.0.1:18082/ors`. Kontener: `cracow-ors-spike`. Obraz w `compose.yml` jest przypięty do wersji i SHA256.

## Zmierzone wyniki

| Co | Wynik |
| --- | --- |
| PBF Geofabrik | 202 209 422 B, zweryfikowana opublikowana suma MD5 |
| Stan OSM odczytany przez ORS | 2026-10-01 20:22:06 UTC |
| Inicjalizacja profilu z budową grafu | 154,885 s według logu ORS |
| Węzły / krawędzie grafu | 982 718 / 1 151 629 |
| Graf na dysku | 225,1 MiB alokacji, w tym przygotowane landmarki |
| Cache wysokościowy | 370,8 MiB, cztery kafle SRTM |
| Największa próbka pamięci kontenera | 2,992 GiB, okresowe próbki; nie pomiar dokładnego maksimum |
| Limity testu | 6 CPU, 12 GiB kontener, JVM Xms 2 GiB / Xmx 8 GiB |
| Odtworzenie kontenera z istniejącym grafem | gotowość po 9,849 s; te same hashe grafu i data budowy |

Dowody: [pobranie](evidence/osm-download.json), [metryki](evidence/build-summary.json), [log budowy](evidence/build-container.clean.log), [konfiguracja zapisana w grafie](evidence/graph_build_info.yml), [test trwałości](evidence/persistence-test.json).

Nie jest to benchmark minimalnych wymagań sprzętowych. Dane wysokościowe nie zastępują pomiarów krawężników i pochylni.

## Rzeczywiste żądania API

| Próba | Wynik |
| --- | --- |
| Floriańska | 306,0 m, poprawny GeoJSON i indeksy instrukcji |
| Grodzka | 369,4 m, poprawny GeoJSON i indeksy instrukcji |
| Kazimierz | 270,4 m, poprawny GeoJSON i indeksy instrukcji |
| Zaostrzone ograniczenia | pierwsze dwie trasy bez zmiany, Kazimierz 665,6 m |
| Sztuczna bariera przy Floriańskiej | 306,0 → 481,8 m; nowa linia nie przecina polygonu |
| Całkowicie zablokowany początek | HTTP 404 / ORS 2010, bez poluzowania wymagań i bez przesuwania startu poza promień |
| Wymagana szerokość 10 m | ORS nadal zwraca 306,0 m; to wykryte ograniczenie danych/filtra |

[Główny wynik testów](results/20261003T004132.150748Z/summary.json) i [kontrola braku dostępnego startu](results/20261003T004323.832555Z/summary.json) zawierają odnośne żądania i odpowiedzi w tych samych katalogach. Pierwsza próba w `results/20261003T004110.648418Z` zachowuje błąd klienta: dla endpointu GeoJSON trzeba wysłać nagłówek `Accept: application/geo+json`; początkowy `application/json` dawał 406. Poprawiona próba zakończyła się PASS.

Pierwsze obliczenie bazowe trwało 266 ms, kolejne bazowe około 16 ms; pierwsza próba objazdu 1,344 s. To pojedyncze lokalne pomiary, nie SLA ani test wydajności pod obciążeniem.

Parametry profili, walidację geometrii i pełny zakres testu opisuje [TESTING.md](TESTING.md). Współrzędne są orientacyjnymi punktami na ulicach/dojściach. Nie przeprowadzono pomiarów w terenie ani testu GPS w telefonie.

## Znalezione ograniczenie szerokości

W ORS 10.0.1 `checkMinimumWidth()` odrzuca zbyt wąskie odcinki tylko wtedy, gdy zapisana szerokość jest większa od zera. Zero oznacza brak danych. Ponadto `accept()` przepuszcza odcinek całkowicie pozbawiony atrybutów wheelchair przed sprawdzeniem `surface_quality_known`. Dlatego ta opcja nie zapewnia kompletności wszystkich parametrów dostępności. [Kod użytej wersji](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/edgefilters/WheelchairEdgeFilter.java).

Powiązanie zwróconej trasy z surowym PBF pokazało konkretny przykład: Floriańska używa OSM way `3989492`, z `wheelchair=yes`, `surface=sett`, `smoothness=excellent`, lecz bez jakiegokolwiek tagu zawierającego `width`. [Dokładne tagi ze snapshotu](evidence/florianska-osm-tags.json), [odpowiedź ORS z identyfikatorem OSM](evidence/florianska-extra-info.response.json).

Osobny audyt w prostokącie `19.79,49.96,20.22,50.13` objął 186 890 obiektów OSM way w wybranych kategoriach dróg i ścieżek. `width` występuje na 2,317%, `surface` na 53,915%, `smoothness` na 9,158%, `incline` na 3,243%. To liczby obiektów, nie procent długości tras, nie zbiór wyłącznie dostępnych chodników i nie granica administracyjna Krakowa. Krawężniki często są węzłami: raport liczy je osobno. [Metoda i pełne wyniki](evidence/osm-tag-audit.json).

Wniosek dla implementacji: ORS nadaje się do obliczania kandydatów tras i objazdów. Ocena „potwierdzony przejazd” wymaga osobnej polityki nieznanych danych i sprawdzania istotnych odcinków. Nie można jej wyprowadzić z samego HTTP 200 i `minimum_width`.

Odpowiedzi zachowują warning 4 o niedostępnym dodatkowym `roadaccessrestrictions`. To brak dodatkowej informacji w odpowiedzi, nie potwierdzenie braku ograniczeń na trasie. Nie ukryliśmy ostrzeżeń. Szczegóły wersji opisano w `TESTING.md`.

## Odtworzenie

Z katalogu głównego projektu, z działającym Docker Desktop:

```powershell
py -3.12 experiments/ors/download_osm.py
docker compose -f experiments/ors/compose.yml up -d
py -3.12 experiments/ors/monitor_build.py
py -3.12 experiments/ors/collect_build_evidence.py
py -3.12 experiments/ors/test_routes.py
py -3.12 experiments/ors/test_persistence.py
```

`download_osm.py` pobiera aktualny plik `latest` i zapisuje jego daty oraz hashe. Dokładny użyty snapshot jest zachowany w `input/`; kolejny dzień może przynieść inne dane i wyniki. Samo podmienienie PBF nie aktualizuje istniejącego grafu. Do świadomej przebudowy trzeba włączyć `REBUILD_GRAPHS`, uruchomić kontener ponownie i potem przywrócić `False`.

Audyt PBF wymaga osobnego pakietu:

```powershell
py -3.12 -m venv experiments/ors/.venv
.\experiments\ors\.venv\Scripts\python.exe -m pip install --upgrade osmium==4.3.1
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/test_osmium_exit.py
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/audit_osm.py
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/inspect_route_osm.py
```

Audyt wszystkich obiektów trwa kilka minut. API tras oraz pozostałe skrypty korzystają ze standardowej biblioteki Pythona.

Na Windows z `osmium==4.1.1` pełne skrypty zapisywały kompletny JSON, ale proces uruchamiający Pythona pozostawał aktywny. Sam import kończył się poprawnie. Także mini próba PBF z bezpośrednim `C:/Python312/python.exe`, bez launchera venv, przekroczyła 15 s; nie ustalono więc, że winny jest wyłącznie launcher. Zaktualizowano lokalne środowisko do `osmium==4.3.1` i zmieniono oba odczyty na jawny `with osmium.io.Reader(...)`, który zamyka reader przed zakończeniem skryptu. Join tagów czyta tylko typ `WAY`. [Dokumentacja Reader i ThreadPool](https://docs.osmcode.org/pyosmium/latest/reference/IO/) opisuje zamykanie zasobów oraz prywatne pule wątków czytelnika.

`test_osmium_exit.py` sprawdza rzeczywisty zapis i odczyt małego PBF przez klasy `Audit` i `Ways`, liczniki oraz tag szerokości. Wymaga również zakończenia procesu potomnego w ciągu 15 s, więc samo wypisanie JSON nie wystarcza. [Potwierdzony wynik](evidence/osmium-exit-smoke.json): Python 3.12.4, osmium 4.3.1, zwykły launcher venv, `PASS`, kod wyjścia dziecka i całego polecenia `0`, czas 0,284 s, 2 węzły i 2 drogi, 1 droga z szerokością. Test używa wyłącznie plików tymczasowych i nie nadpisuje `evidence/`. Pełnego audytu Małopolski po tej zmianie nie powtarzano; wcześniejsze pliki dowodowe pozostają niezmienione. Nie potwierdzono osobno, czy sama aktualizacja bez zmiany cyklu życia readera rozwiązuje wszystkie przypadki zawieszenia.

```powershell
# Zatrzymanie wyłącznie tej usługi, z zachowaniem danych:
docker compose -f experiments/ors/compose.yml stop
# Ponowne uruchomienie:
docker compose -f experiments/ors/compose.yml up -d
```

Graf, wysokości i logi pozostają w nazwanych wolumenach projektu `cracow-ors-spike`. Pobranie źródeł nie wysyła edycji do OSM. OSM należy prezentować z atrybucją `© OpenStreetMap contributors`; źródłem ekstraktu jest [Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html). Konfiguracja bazuje na [oficjalnej instrukcji Docker](https://giscience.github.io/openrouteservice/run-instance/running-with-docker).
