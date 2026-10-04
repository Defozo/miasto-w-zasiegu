# Wyniki prób technicznych, 3 października 2026

Wykonano oba zadania: lokalną budowę grafu ORS dla całej Małopolski oraz ekstrakcję wymiarów 13 modeli wózków z porównaniem z dokumentacją producentów. To działające próby backendu i danych. Nie powstała jeszcze aplikacja ani sprawdzona w terenie nawigacja.

## ORS i dane OSM

| Próba | Wynik |
| --- | --- |
| Pobranie Małopolski z Geofabrik | 202 MB, suma kontrolna zgodna |
| Budowa ORS 10.0.1, profil wheelchair, wysokości | 154,885 s, 982 718 węzłów i 1 151 629 krawędzi |
| Trzy trasy w Krakowie | Poprawne odpowiedzi, geometria i instrukcje |
| Zmiana wymagań wózka | Na Kazimierzu trasa zmieniła się z 270,4 m na 665,6 m |
| Sztuczna przeszkoda na Floriańskiej | Objazd 306,0 → 481,8 m, bez przecięcia przeszkody |
| Zablokowany początek | Jawny błąd 404 / ORS 2010, bez fallbacku |
| Odtworzenie kontenera | Gotowość po 9,849 s, zachowane hashe i data grafu |

Usługa pozostaje uruchomiona lokalnie: `http://127.0.0.1:18082/ors`. To adres na tym komputerze; nie jest publicznym backendem dla telefonów.

Wykryte ograniczenie: wymaganie szerokości **10 m** nadal zwraca tę samą trasę przez Floriańską. Powiązanie z OSM way `3989492` potwierdziło brak tagów szerokości. Kod ORS pomija sprawdzenie minimalnej szerokości, kiedy brak wartości. Audyt 186 890 obiektów drogowych w określonym prostokącie obejmującym Kraków wykazał tag `width` jedynie na 2,317%. To liczba obiektów w wybranych kategoriach, nie procent długości chodników.

Dlatego do projektu proponujemy ORS do obliczania tras i objazdów, z osobną oceną braków danych oraz potwierdzonych pomiarów. Sam wynik routingu nie wystarcza do oznaczenia trasy jako sprawdzonej dla konkretnego wózka.

[Pełny raport, źródła, konfiguracja i polecenia odtworzenia ORS](experiments/ors/README.md).

## Katalog wózków

Pobrano rzeczywisty eksport GKV z 28 września 2026. Skrypt odnalazł i sparsował szerokość całkowitą we wszystkich 13 wybranych rekordach. Zachował jednostki, zakresy i formuły. To dobrana próba, nie losowy benchmark całego katalogu. Porównanie dokumentów producentów wykonano oddzielnie; nie jest to wynik automatycznej oceny wiarygodności przez parser.

| Ocena szerokości całkowitej | Liczba modeli |
| --- | --- |
| Potwierdzona zgodność porównywanego parametru | 4 |
| Konflikt źródeł przy dopasowanym HMV | 2 |
| Nierozstrzygnięte przez wariant, konfigurację lub brak danych | 7 |

Dwa konkretne konflikty:

- **Lexis light, HMV 18.50.02.2128:** GKV podaje `siedzisko + 2,2 cm`; producent `siedzisko + 22 cm`. Różnica to 19,8 cm. [Producent](https://www.trendmobil.com/lexis-light-sb-51.html).
- **Quickie Q300 M Mini, HMV 18.50.04.0217:** GKV podaje 610–620 mm. Broszura producenta podaje 520–570 mm, a dla kół 13 cali wymienionych w GKV konkretnie 540 mm. [Broszura, strony 11 i 20](https://www.sunrisedice.com/asset-bank/assetfile/59808.pdf).

Zgodność dotyczy szerokości całkowitej, nie całej karty modelu. Nawet wśród tych czterech rekordów znaleziono rozbieżności w innych polach. W żadnym z 13 rekordów parser nie znalazł jednoznacznie opisanej długości całkowitej ani promienia/średnicy skrętu. Q50 R ma ogólne `Länge`, zachowane bez przypisywania mu znaczenia długości z podnóżkami.

Katalog nadaje się do podpowiadania modelu i parametrów do potwierdzenia. Profil użytkownika powinien przechowywać konfigurację oraz szerokość zmierzoną z wystającymi elementami. Szerokość podstawy, siedziska i całego wózka pozostają osobnymi polami; zakres katalogowy nie staje się jedną liczbą dla egzemplarza.

[Tabela wszystkich 13 modeli ze źródłami](experiments/wheelchair-dimensions/RESULTS.md), [metoda i odtworzenie ekstrakcji](experiments/wheelchair-dimensions/README.md), [pełne dane porównania](experiments/wheelchair-dimensions/comparison.json).

## Co jest gotowe do dalszej pracy

Graf, plik PBF, lokalny serwer, skrypty testów API, importer wymiarów oraz dowody źródłowe są zapisane w projekcie. Kolejny etap implementacji może korzystać z tych artefaktów. Test nie obejmował pomiarów fizycznych wózków, kontroli tras w terenie, nawigacji z wygaszonym ekranem ani automatycznych rozmów telefonicznych.
