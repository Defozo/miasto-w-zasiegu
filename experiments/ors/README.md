# Własny openrouteservice dla Małopolski

Konfiguracja uruchamia ORS 10.0.1 z profilem `wheelchair` i danymi wysokościowymi. Obraz w `compose.yml` jest przypięty do wersji oraz SHA-256. Kontener `cracow-ors-spike` udostępnia usługę na `http://127.0.0.1:18082/ors` po pobraniu danych i ukończeniu budowy grafu. Repozytorium nie zawiera gotowego PBF ani grafu.

Osobny plik `compose-drive.yml` uruchamia silnik samochodowy dla podróży łączonych. Aplikacja łączy oba etapy przez własne API; publiczny klient nie powinien łączyć się bezpośrednio z portem ORS.

## Uruchomienie

Z katalogu głównego projektu, z działającym Dockerem i Pythonem 3.12:

```powershell
py -3.12 experiments/ors/download_osm.py
docker compose -f experiments/ors/compose.yml up -d
docker compose -f experiments/ors/compose-drive.yml up -d
py -3.12 experiments/ors/monitor_build.py
```

`download_osm.py` pobiera aktualny ekstrakt Małopolski `latest` i zapisuje daty oraz sumy kontrolne. Kolejne pobranie może przynieść inne dane. Pierwsza budowa grafu wymaga czasu, pamięci i wolnego dysku. Konfiguracja wheelchair ustawia limit kontenera 12 GiB, 6 CPU oraz JVM Xms 2 GiB / Xmx 8 GiB; to ustawienia projektu, nie potwierdzone minimum sprzętowe.

Poczekaj na gotowość `http://127.0.0.1:18082/ors/v2/health` i, dla silnika samochodowego, `http://127.0.0.1:18083/ors/v2/health`. Pliki danych, grafy, cache wysokości i logi są generowane podczas uruchomienia.

## Testowanie

```powershell
py -3.12 experiments/ors/collect_build_evidence.py
py -3.12 experiments/ors/test_routes.py
py -3.12 experiments/ors/test_persistence.py
```

Skrypty zapisują raporty danego wykonania. `test_persistence.py` odtwarza wskazany kontener, więc uruchamiaj go w środowisku testowym lub uzgodnionym oknie serwisowym. Wyniki nie są dołączone do źródłowego repozytorium. [TESTING.md](TESTING.md) opisuje profile, kontrolę geometrii i ograniczenia interpretacji.

Do sprawdzania tagów PBF potrzebny jest osobny pakiet osmium:

```powershell
py -3.12 -m venv experiments/ors/.venv
.\experiments\ors\.venv\Scripts\python.exe -m pip install osmium==4.3.1
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/test_osmium_exit.py
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/audit_osm.py
.\experiments\ors\.venv\Scripts\python.exe experiments/ors/inspect_route_osm.py
```

`test_osmium_exit.py` sprawdza zapis i odczyt małego PBF oraz zakończenie procesu. Samo wypisanie JSON nie potwierdza zwolnienia zasobów. Pełne sprawdzenie Małopolski może potrwać kilka minut. Pozostałe skrypty API korzystają ze standardowej biblioteki Pythona.

## Aktualizacja grafu

Samo podmienienie PBF nie aktualizuje istniejącego grafu. Po zachowaniu poprzedniej wersji ustaw `REBUILD_GRAPHS` na `True` dla odpowiedniego silnika, uruchom kontener ponownie i po zakończeniu przywróć `False`. Sprawdź gotowość, wersję danych i przykładowe trasy. Import katalogu miejsc OSM do aplikacji nie zastępuje tej operacji.

```powershell
# Zatrzymanie usługi z zachowaniem danych:
docker compose -f experiments/ors/compose.yml stop
# Ponowne uruchomienie:
docker compose -f experiments/ors/compose.yml up -d
```

Graf, wysokości i logi pozostają w nazwanych wolumenach projektu. Nie usuwaj wolumenów jako sposobu zwykłego restartu.

## Dane i ograniczenia

W ORS 10.0.1 `checkMinimumWidth()` odrzuca zbyt wąski odcinek, gdy ma on zapisaną szerokość większą od zera. Zero oznacza brak danych. `accept()` może dopuścić odcinek bez atrybutów wheelchair przed sprawdzeniem `surface_quality_known`. Ustawienie szerokości i odpowiedź HTTP 200 nie stanowią potwierdzenia pomiaru całej drogi. [Kod użytej wersji](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/edgefilters/WheelchairEdgeFilter.java).

Dane wysokościowe nie zastępują pomiarów krawężników, pochylni ani wejść. Zachowuj ostrzeżenia silnika; brak dodatkowej informacji w odpowiedzi nie oznacza braku ograniczenia. Syntetyczny objazd sprawdza geometrię API, nie faktyczny stan ulicy.

Źródło ekstraktu: [Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html). Dane OSM wymagają atrybucji `© OpenStreetMap contributors` i stosowania [ODbL](https://www.openstreetmap.org/copyright). Podstawa konfiguracji: [oficjalna instrukcja Docker ORS](https://giscience.github.io/openrouteservice/run-instance/running-with-docker).
