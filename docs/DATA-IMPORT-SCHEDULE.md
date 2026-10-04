# Automatyczny import ZTP i OpenStreetMap

Harmonogram dla publicznego prototypu instaluje
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-import-schedule.ps1`.
Opcja `-RunSoon` dodaje jednorazowy start za minutę do sprawdzenia całego mechanizmu.

| Zadanie Windows | Cykl w Europe/Warsaw | Zakres |
| --- | --- | --- |
| `MiastoWZasiegu-Import-ZTP` | codziennie 04:10 | przystanki KMK i parkingi P+R |
| `MiastoWZasiegu-Import-OSM` | niedziela 04:40 | miejsca, parkingi, połączenia parkingów, adresy, bariery i indeks przestrzenny |

Zadania uruchamiają `scripts/run-data-imports.py` przez istniejące środowisko
Python z osmium. Wymagają działającego komputera i zalogowanej sesji właściciela,
tak jak publiczny serwer demonstracyjny. Windows nadrabia pominięty termin po
odzyskaniu możliwości uruchomienia i ponawia nieudany import do trzech razy co
30 minut. Nakładające się wykonania są blokowane. Import jest uruchamiany bezpośrednio przez harmonogram systemowy.

## Źródła i publikacja

ZTP korzysta z istniejących adapterów opisanych w [MUNICIPAL-STOPS](MUNICIPAL-STOPS.md)
i [DATA-SOURCES](DATA-SOURCES.md). Oba importery mają walidację,
oddzielne kopie ostatnich poprawnych danych i jawny status awarii. API odczytuje
nowe dane miejskie bez restartu. Błąd jednego źródła nie pomija próby drugiego.

OSM pochodzi z [ekstraktu Małopolski Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html).
Plik jest pobierany przez HTTPS i sprawdzany z opublikowaną sumą MD5; dodatkowo
zapisujemy SHA-256, URL i czas pobrania. Warunki ODbL i atrybucja OSM pozostają
w metadanych. Import nie podnosi statusu danych do audytu terenowego.

Każde wykonanie buduje osobny katalog `server/data/osm-generations/<identyfikator>`.
Wszystkie warstwy korzystają z tego samego PBF. Walidacja sprawdza identyfikatory,
współrzędne, wspólny czas mapy, brak cofnięcia daty źródła, kompletność topologii
parkingów i indeks SQLite. Spadek liczby rekordów o ponad 30%, pusty wynik lub
źródło starsze niż osiem dni blokują publikację. Osobna instancja API z bazą
w pamięci sprawdza katalog, adres i warstwę barier.

Dopiero wtedy atomowo zmienia się wskaźnik `server/data/osm-current.json`.
Publiczne API jest restartowane i potwierdza załadowaną generację w
`GET /api/health`, pole `osmGeneration`. Błąd startu przywraca poprzedni wskaźnik
i uruchamia poprzedni zestaw. Końcowe sprawdzenie używa również publicznego HTTPS.
Awaria samego publicznego proxy oznacza błąd wykonania w dzienniku, bez cofania
poprawnie wczytanych lokalnych danych.

Wymiana danych OSM usuwa nieobecne już rekordy źródłowe wyłącznie z tabeli
`places`. Konta, zgłoszenia, zapisane plany, paszporty i ich historia pozostają
w osobnych tabelach. Dane miejskie pozostają w dotychczasowych plikach.

**Grafy tras ORS nie są przebudowywane przez ten harmonogram.** Używają
dotychczasowego źródła i wymagają osobnego procesu wdrożenia grafu. Procesy
deweloperskie już działające na innych portach należy przeładować oddzielnie.

## Obsługa i sprawdzenie

- Bieżący status: `artifacts/runtime/imports/ztp.json` i `osm.json`.
- Każde wykonanie zapisuje osobny dziennik oraz wynik z datą i identyfikatorem.
- `lastSuccessAt` i `lastSuccessfulResult` pozostają dostępne także po błędzie.
- Stan i następny start: `Get-ScheduledTask -TaskName 'MiastoWZasiegu-Import-*'`
  oraz `Get-ScheduledTaskInfo`.
- Ręczne ponowienie używa tego samego zadania, np.
  `Start-ScheduledTask -TaskName MiastoWZasiegu-Import-ZTP`.
- Po błędzie samej aktywacji można ponownie sprawdzić przygotowany zestaw przez
  `scripts/run-data-imports.py osm --resume-generation <identyfikator>`.
  Nadal przechodzi pełną walidację i test API; zwykły harmonogram pobiera nowy PBF.
- Stare generacje i dzienniki pozostają do diagnostyki; ich retencją i miejscem
  na dysku zarządza operator. Źródłowy pobrany PBF jest usuwany z poprawnej
  generacji po walidacji. Oryginalny plik wejściowy ORS pozostaje bez zmian.

Testy obejmują odrzucenie uszkodzonego pobrania, pustych danych, niepełnego
wskaźnika, równoległego importu, powrót do poprzedniej generacji po awarii API
oraz zachowanie zgłoszeń przy usuwaniu starych rekordów OSM. Istniejące testy
ZTP sprawdzają niepełne stronicowanie, zmiany źródła w trakcie importu i jego
niedostępność. Testy używają odrębnych katalogów i baz, bez fikcyjnych zgłoszeń
w publicznej aplikacji.

Skrypt aktywacji rozpoznaje proces demonstracyjny po nasłuchu `0.0.0.0:4180`
i poleceniu `server/public-server.mjs`. Kontrola wewnętrzna używa
`127.0.0.2:4180` z nagłówkiem Host `localhost`, a końcowa publicznego HTTPS.
Przed przeniesieniem na inny host dostosuj rozpoznawanie procesu i adresy kontroli.
