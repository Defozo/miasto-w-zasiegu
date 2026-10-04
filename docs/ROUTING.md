# Wyznaczanie tras

Stan zweryfikowany 3 października 2026. Backend korzysta z lokalnego openrouteservice 10.0.1 i profilu `wheelchair`. Kolejność startu, maksymalnie 5 przystanków i celu pozostaje niezmieniona. Limit 20 km dotyczy sumy prostych odległości między tymi punktami, a dopasowanie każdego punktu do sieci ma promień 30 m. Punkt na sieci nie potwierdza właściwego wejścia ani strony ulicy.

## Zgłoszenia i objazdy

- Obliczenie bierze bieżący odczyt zgłoszeń. Pomija wpisy rozwiązane, sporne i wygasłe stany tymczasowe. Stałe elementy nie wygasają po dobie; data potwierdzenia i potrzeba ponownego sprawdzenia pozostają jawne.
- Szerokość i wysokość krawężnika wpływają na omijanie, gdy podano pomiar i odpowiedni limit profilu. Szacunek lub brak pomiaru pozostaje informacją do oceny.
- Pierwsze żądanie wyznacza przebieg bez zgłoszeń. Backend dopasowuje do niego geometrie zgłoszeń i identyfikatory dróg OSM z odpowiedzi ORS. Raporty z innych części miasta nie zużywają limitu 100 obszarów.
- Punktowy krawężnik wymaga powiązania z przejściem OSM. Liniowy krawężnik blokuje przekroczenie linii, a nie ruch wzdłuż niej. Inny dokładny punkt wymaga bliskości do 1,5 m od trasy. Orientacyjne punkty są ostrzeżeniem, bez automatycznego blokowania sąsiedniego chodnika. Linie i obszary są sprawdzane względem całych segmentów trasy.
- Zwykle wystarcza jedno żądanie. Łącznie dopuszczamy najwyżej 3 żądania, wyłącznie gdy doszły nowe raporty. Limit 100 jest sprawdzany także po ich dołączeniu. Przekroczenie limitu lub kolejne nieobsłużone przeszkody po trzeciej próbie kończą się błędem; nie zwracamy wcześniejszego, niedokończonego wyniku.
- Wszystkie próby współdzielą budżet 30 sekund. Odczyt pojedynczej odpowiedzi ma limit mniejszy z wartości: 15 sekund lub pozostały budżet. Wygaśnięcie budżetu kończy obliczenie błędem przed 35-sekundowym limitem klienta web.
- Obszary omijania wynikają z zaznaczonej geometrii i wąskiego bufora dopasowanego fragmentu. Wynik jest ponownie sprawdzany pod kątem przecięcia z wyłączonymi obszarami. Zgłoszenia i dokładność położenia pozostają deklaracjami społeczności, bez niezależnego audytu.

`source.reportsAvoided` zawiera identyfikatory faktycznie przekazanych obszarów, a `reportPolygonsCount` ich liczbę. `reportSelection.mode` to `geometry-and-crossing`; zapisuje też liczbę żądań. Wyłączenie omijania nie usuwa faktów i ostrzeżeń z widoku trasy. `accessibility.events` porządkuje informacje o nawierzchni, schodach, krawężnikach i zgłoszeniach według odległości od startu, z pochodzeniem i brakami danych. `coverage` podaje długość znanej i nieznanej nawierzchni na dopasowanych drogach.

## Profil i nawierzchnia

Brak zmierzonej szerokości nie tworzy domyślnego pomiaru. Nachylenie i krawężniki są przekazywane zgodnie z profilem; stopnie pozostają wykluczone. Nie łagodzimy tych wymagań po odmowie silnika.

Przy wyłączonej preferencji utwardzenia wysyłamy `surface_type: any`, bez dodatkowego filtra równości i klasy drogi. Przy włączonej preferencji `surface_type: cobblestone` obejmuje cały zakres utwardzonych powierzchni ORS, a `track_type: grade2` wyklucza klasy 2–5, pozostawiając klasę 1. Nie oznacza to równej nawierzchni: kostka, wyboje i koleiny nadal wymagają oceny. Brak danych o nawierzchni nie daje gwarancji.

Semantykę zweryfikowano w źródłach wersji 10.0.1: [kodowanie powierzchni](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/WheelchairTypesEncoder.java), [warunki odrzucania odcinków](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/edgefilters/WheelchairEdgeFilter.java), [domyślne parametry](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/parameters/WheelchairParameters.java). Filtr powierzchni odrzuca wartości większe od progu; filtr klasy drogi odrzuca wartości równe progowi lub większe. Stąd `grade1` nie byłoby poprawnym progiem dopuszczenia klasy 1.

## Testowanie i ograniczenia

Testy `api`, `accessibility` i `routing-regressions` obejmują pomiary, przekroczenie krawężnika i ruch wzdłuż niego, trwałość, sprzeczności, odległe raporty, przystanki, dodatkowe raporty na objazdach, limity i awarię kolejnej próby. Część testów używa kontrolowanego zegara lub odpowiedzi silnika; rzeczywisty ORS wymaga osobnego uruchomienia. [Instrukcja testowania](TESTING.md).

Brak silnika, limit czasu, niepoprawna odpowiedź i brak trasy zwracają jawny błąd bez zastępczej linii. Zapisany plan jest historycznym wynikiem. Dopiero ponowne obliczenie uwzględnia aktualny profil i odczyt zgłoszeń; wygaśnięcie raportu nie zmienia samodzielnie zapisanej geometrii. Miejskie opisy nie zmieniają grafu ORS, a prawidłowe obliczenie nie potwierdza terenowej przejezdności.
