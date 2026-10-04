# Narzędzia do sprawdzania tras i danych sprzętu

Katalog `experiments` zawiera konfigurację openrouteservice i narzędzia do porównywania parametrów sprzętu. Są wykorzystywane przy rozwoju Miasta w zasięgu; opis działającej aplikacji znajduje się w [README](README.md).

## Routing

[Konfiguracja ORS](experiments/ors/README.md) uruchamia własny silnik dla Małopolski. Skrypty sprawdzają gotowość, geometrię tras, zmianę ograniczeń, ominięcie syntetycznej przeszkody i błąd niedostępnego początku. [Kryteria testów](experiments/ors/TESTING.md) odróżniają poprawną odpowiedź API od fizycznej przejezdności.

Repozytorium zawiera skrypty i konfigurację. PBF, grafy i wyniki poszczególnych uruchomień trzeba pobrać lub wygenerować osobno. Wynik zależy od daty danych i konfiguracji silnika; nie jest stałą obietnicą długości ani czasu przejazdu. Brak tagu szerokości może pozostawić odcinek w trasie pomimo ustawionego ograniczenia. Ocenę należy uzupełnić o źródła, brakujące informacje i pomiar terenowy.

## Parametry sprzętu

[Ekstraktor GKV](experiments/wheelchair-dimensions/README.md) porównuje wybrane rekordy katalogu z dokumentacją producentów. [Tabela modeli i źródeł](experiments/wheelchair-dimensions/RESULTS.md) oraz [dane porównania](experiments/wheelchair-dimensions/comparison.json) zachowują dopasowanie wariantu, jednostki, zakresy i konflikty.

To celowo dobrana próba, nie reprezentatywny benchmark całego katalogu. Zgodność jednego parametru nie oznacza zgodności całej specyfikacji. Szerokość siedziska, podstawy i całego urządzenia są różnymi wielkościami; zakres katalogowy nie staje się jedną liczbą dla konkretnego egzemplarza. Użytkownik powinien potwierdzić wariant oraz pomiar z wystającymi elementami.
