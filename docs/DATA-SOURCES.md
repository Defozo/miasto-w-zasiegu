# Źródła i jakość danych

Aplikacja oddziela pozyskiwanie danych od prezentacji. Importery zapisują wersjonowane pliki i metadane, API łączy je w katalog bez ukrywania pochodzenia, a interfejs pokazuje fakty, daty, ograniczenia i sprzeczności. Data pobrania lub edycji mapy nie jest datą wizyty w terenie. Brak informacji nie oznacza dostępnego miejsca.

## OpenStreetMap i podkład mapy

Źródłem miejsc, parkingów, adresów oraz dróg i barier jest [PBF Małopolski z Geofabrik](https://download.geofabrik.de/europe/poland/malopolskie.html). Skrypty `import-pois.py`, `import-parking-access.py`, `import-locations.py` i `import-accessibility.py` wycinają obszar Krakowa i okolicy. Zapisują źródło oraz czas mapy i importu. Znaczniki dostępności są deklaracjami źródła, nie potwierdzeniem terenowym.

Obowiązuje [ODbL i atrybucja OpenStreetMap](https://www.openstreetmap.org/copyright). Publikacja pochodnej bazy wymaga stosowania właściwych warunków ODbL. Harmonogram importuje katalog OSM w niedzielę o 04:40 Europe/Warsaw; odrębne grafy ORS wymagają własnej przebudowy. Walidacja i aktywacja generacji zachowują poprzedni poprawny zestaw przy błędzie. [Harmonogram](DATA-IMPORT-SCHEDULE.md), [routing](ROUTING.md).

Podkład mapy dostarcza [OpenFreeMap](https://openfreemap.org/), z oznaczeniami © OpenStreetMap contributors i © OpenMapTiles. Kafelki nie są audytem dostępności i nie są pobierane na zapas do offline. Awaria podkładu nie zmienia danych w tekstowej liście ani instrukcji trasy.

## Miejskie przystanki i parkingi P+R

Rzeczywiście używane zbiory miejskie pochodzą z Zarządu Transportu Publicznego w Krakowie, przez [kartę Komunikacja Miejska w Krakowie](https://otwartedane.um.krakow.pl/zbiory-danych/komunikacja-miejska-w-krakowie-kmk):

| Zbiór i API | Pobieranie i użycie | Ograniczenia |
| --- | --- | --- |
| [Przystanki Komunikacji Miejskiej](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Przystanki_Komunikacji_Miejskiej_w_Krakowie/FeatureServer/0) | `node scripts/import-municipal-stops.mjs`; stronicowane HTTPS, wybrane pola i bbox; typ, nawierzchnia peronu, krawężnik, ławki i wiaty | Typ krawężnika nie jest jego wysokością; brak pomiaru wejścia i dojścia; liczba ławek nie tworzy ich dokładnych lokalizacji |
| [Park and Ride](https://services-eu1.arcgis.com/svTzSt3AvH7sK6q9/arcgis/rest/services/Park_and_Ride/FeatureServer/0) | `node scripts/import-municipal-parkings.mjs`; walidowany plik z danymi parkingów, odczytywany przez API | Liczba stanowisk nie oznacza bieżącej dostępności miejsca, jego wymiarów ani ciągłości dostępnej przesiadki |

Stosujemy [warunki wykorzystania Portalu Otwartych Danych Krakowa](https://otwartedane.um.krakow.pl/warunki-wykorzystania-danych-udostepnianych-w-portalu): oznaczenie Gminy Miejskiej Kraków, portalu, źródła oraz czasu wytworzenia i pozyskania, z uwzględnieniem warunków konkretnego zbioru. Nie nadajemy tym danym niewskazanej przez źródło licencji CC. Przy zmianie sposobu wykorzystania operator ponownie sprawdza warunki.

Harmonogram pobiera oba zbiory codziennie o 04:10 Europe/Warsaw. Żądanie użytkownika korzysta z lokalnego pliku, nie odpytuje miasta za każdym otwarciem karty. Błąd importu pozostawia ostatni poprawny zapis z jego datą; brak pierwszej kopii jest jawny. Po 48 godzinach bez udanej synchronizacji dane są oznaczane jako nieświeże. Terminy obowiązywania przystanku są sprawdzane również przy odczycie. [Kontrakt i zabezpieczenia importera](MUNICIPAL-STOPS.md).

`server/place-fusion.mjs` łączy tożsamość przystanku z OSM tylko przy jednoznacznej zgodności nazwy z numerem stanowiska i odległości do 35 m. Parking P+R łączy z jednoznacznym obszarem OSM albo zgodną nazwą w promieniu 120 m. Niejednoznaczne rekordy pozostają osobne, oba źródła i rozbieżne fakty są zachowane. Powiązanie rekordów nie jest dowodem dostępnego przejścia. Import opisów miejskich nie modyfikuje grafu ORS.

## Obserwacje i paszporty

Zgłoszenia mieszkańców zapisujemy oddzielnie od importów. Autor podaje rzeczywiste miejsce, czas i znane warunki. Potwierdzenie, zgłoszenie rozbieżności i korekta tworzą historię. Stałe elementy wymagają ponownego sprawdzenia po 90 dniach; tymczasowe warunki domyślnie wygasają po 24 godzinach, awaria windy po 4 godzinach. Autor może wskazać koniec do 30 dni. Rozbieżność wyłącza automatyczne omijanie do czasu wyjaśnienia.

Dobre odkrycia mają oddzielne okresy ważności: odpoczynek 7 dni, wejście bez schodów 24 godziny, działająca w chwili sprawdzenia winda 2 godziny. Nie są przeszkodami i nie wpływają bezpośrednio na routing. XP i iskry potwierdzają spełnienie reguł zapisu, nie obecność na miejscu ani prawdziwość pomiaru.

[Paszporty obiektów](PLACE-PASSPORTS.md) przypisują źródło, datę i autora do cechy oraz zachowują historię publikacji. Różne aktualne wartości nie są uśredniane: karta pokazuje sprzeczność. Potwierdzenie domeny wskazuje kontrolę nad stroną, nie własność obiektu ani certyfikat dostępności.

## Opcjonalne źródła zewnętrzne

Publiczne strony obiektów i dokumentacja producentów są odczytywane na żądanie. Wyniki AI zachowują odnośniki, krótkie uzasadnienia, datę i braki. Nieudokumentowany wymiar nie staje się pomiarem. Fakty z publicznej strony obiektu są przechowywane do 7 dni, a brak danych lub błąd krótko, przez minutę. Prawo do masowego ponownego użycia treści wymaga odrębnej oceny każdej domeny.

Google Places UI Kit i Street View są pokazywane w komponentach Google po działaniu użytkownika. Dane nie są kopiowane do własnej bazy dostępności, a panoramy nie służą automatycznej analizie barier. Przy niedostępności pozostają odnośnik i tekstowe informacje aplikacji. [Zasady techniczne](LEGAL-TECH.md) oraz [przepływ danych i retencja](accessibility-data-flow.json) opisują konfigurację i ograniczenia tych integracji.

## Źródła niepodłączone i nowe adaptery

Toalety ZIW/MSIP, adresy EMUiA, lista muzeów miejskich i dane.gov.pl nie są odrębnymi działającymi importami tego produktu. Karty [toalet MSIP](https://msip.krakow.pl/dataset/3121) i [adresów EMUiA](https://msip.krakow.pl/dataset/1492) są możliwymi kierunkami rozwoju. Dostępny adres REST, WMS lub WFS sam nie ustala prawa do automatycznego pobierania lub redystrybucji. Przed podłączeniem trzeba sprawdzić aktualny endpoint, warunki zbioru i [regulamin MSIP](https://msip.krakow.pl/?dok_id=228972).

Nowy adapter powinien mieć wskazany zbiór/API, licencję, pola i zakres geograficzny, harmonogram, limity pobierania, walidację kompletności, ostatnią poprawną kopię i test awarii. Model danych musi zachować oryginalne identyfikatory, źródło, daty i status wiarygodności. Dołączenie nowej kategorii wymaga opisu jej semantyki w interfejsie i jawnej decyzji o wpływie na routing. Dodanie miasta wymaga również granic i grafów tras, nie tylko zmiany napisu na mapie.
