# Test ekstrakcji wymiarów wózków z GKV

Rzeczywiście wykonany lokalny eksperyment na 13 celowo wybranych modelach. Celem jest sprawdzenie, czy można wyodrębnić szerokość całkowitą z oficjalnego eksportu i porównać ją z dokumentacją producenta. To nie jest gotowy katalog do kwalifikowania przejazdu przez drzwi ani reprezentatywny pomiar jakości całej bazy.

## Uruchomienie

Wymagany Python 3.10 lub nowszy. Ekstrakcja GKV, testy i połączenie wyników wymagają wyłącznie biblioteki standardowej, bez kluczy i płatnych usług. Pomocniczy `manufacturer_download.py` do pobierania i odczytu PDF wymaga dodatkowo `pypdf`.

```powershell
cd experiments/wheelchair-dimensions
python extractor.py
python -m unittest -v test_extractor.py
python compare.py
```

`extractor.py` pobiera datowany ZIP tylko wtedy, gdy nie ma lokalnej kopii. `--refresh-source` pobiera ten sam datowany plik ponownie. Rozpakowywane są wyłącznie cztery jawnie wskazane ścieżki. Kolejne wykonanie odtwarza JSON, CSV i dowody XML. `compare.py` łączy ekstrakcję z ręcznie sprawdzonymi dokumentami producentów, nie wykonuje ponownego researchu internetowego.

## Źródło i zakres

- [Oficjalna strona eksportów GKV](https://www.gkv-datenaustausch.de/leistungserbringer/sonstige_leistungserbringer/positionsnummernverzeichnisse/positionsnummernverzeichnisse.jsp).
- [ZIP z 28.09.2026](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/sonstige_leistungserbringer/positionsnummernverzeichnisse/20260928_HMV.zip), 5 452 196 bajtów. Pobieranie bez konta i klucza.
- W środku XML 84 151 506 bajtów, dwa XSD i dokumentacja modelu DOCX.
- ZIP SHA-256: `86dafe814ce4948775d2a9c57534f28646c56cad776869649e56edd221c3d7f1`.
- 66 150 elementów `HMV_PRODUKT`. Grupa 18: 2777 rekordów, 1336 z polem `MERKMALE`, 848 z tekstem `Gesamtbreite`. Grupa obejmuje również inne wyroby i nie jest listą samych aktualnych wózków.
- Dane mają identyfikatory, producenta, nazwę i daty wpisu. Wymiary są częścią swobodnego tekstu, nie osobnymi polami XML.
- Data eksportu nie oznacza aktualizacji konkretnej karty. Zachowujemy osobno datę przyjęcia i zmiany rekordu.
- Licencja redystrybucji nie została potwierdzona. Pliki źródłowe są lokalnym materiałem badawczym i znajdują się w `.gitignore`.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `source/` | ZIP, pełny XML, XSD, dokumentacja źródłowa |
| `manifest.json` | Liczby rekordów, rozmiary, SHA-256, lista 13 identyfikatorów |
| `selected-models.json` | Nieprzetworzone pola 13 rekordów |
| `evidence/*.xml` | Minimalne samodzielne fragmenty XML dla wszystkich modeli |
| `extractor.py` | Deterministyczny ekstraktor |
| `test_extractor.py` | Testy przypadków wpływających na semantykę wymiarów |
| `extracted.json` | Pełny surowy opis i odrębne wymiary ze znormalizowanymi jednostkami |
| `extracted.csv` | Jeden wiersz na znaleziony wymiar, oryginalna linia i wynik |
| `manufacturer-verification.json` | Niezależnie sprawdzone źródła producentów i oceny |
| `manufacturer-notes.md` | Uwagi do dokumentów, wersji i konfiguracji |
| `manufacturer-sources/` | Pobrane dokumenty producentów, odczytany tekst i logi |
| `manufacturer_download.py`, `manufacturer-sources-manifest.json` | Pomocnicze odtworzenie odczytu dokumentacji PDF |
| `compare.py`, `comparison.json`, `comparison.csv`, `RESULTS.md` | Połączenie dowodów i końcowe wyniki porównania |

## Zasady ekstrakcji

`Gesamtbreite` oznacza osobne pole szerokości całkowitej. `Sitzbreite` i szerokość podstawy pozostają oddzielne. Ogólne `Breite` nie jest traktowane jako szerokość całkowita. Ogólne `Länge` trafia do `length_unspecified`, ponieważ bez dokumentacji nie wiadomo, czy obejmuje podnóżki.

Parser zachowuje wartości pojedyncze, zakresy, listy wyboru, formuły i zastrzeżenia. Wszystkie liczby normalizuje do milimetrów, zachowując oryginalną jednostkę i linię źródłową. `Sitzbreite + 2,2 cm` staje się formułą `seat_width_mm + 22`, nigdy samodzielną szerokością 22 mm. Taki mały dodatek dostaje flagę do weryfikacji, ale oryginalne dane nie są po cichu poprawiane. Warunek `offset < 100 mm` jest heurystyką kontroli jakości, nie normą konstrukcji wózków.

Promień i średnica skrętu nie są zamieniane. Ogólne `Wendekreis` bez jednoznacznego opisu zachowuje nieustaloną semantykę. Brak wymiaru oznacza pustą listę, nie zero. Zakres szerokości nie daje jednej wartości dla konkretnego egzemplarza.

## Interpretacja wyniku porównania

Status porównania dotyczy wyłącznie szerokości całkowitej (`overall_width`). Nie oznacza zgodności całej karty ani szerokości siedziska. Dodatkowe rozbieżności zakresów szerokości siedziska są zachowane jako `secondary_dimension_flags` w `comparison.json`, bez rozstrzygania wersji i konfiguracji.

- `match`: dokument producenta potwierdza porównywany zapis lub konfigurację; trzeba przeczytać ograniczenia dopasowania wersji.
- `conflict`: stwierdzona sprzeczność zapisu wymiaru, jednostki lub semantyki ze źródłem producenta. To może być błąd, nieaktualny wariant albo różna konfiguracja, nie dowód winy konkretnego źródła.
- `insufficient`: brak dostatecznych danych do rozstrzygnięcia, niepewna wersja, niejasne warunki pomiaru lub niedostępne źródło.

Samo pokrywanie się przedziałów nie wystarcza do `match`. Ocena porównania jest ręczna, oparta na dokumentach; ekstrakcja tekstu i łączenie wyników są automatyczne. Na tej próbie nie mierzymy skuteczności automatycznej oceny wiarygodności ani populacyjnej dokładności GKV.

Dla aplikacji wynik nadaje się do podpowiedzi modelu i wymiarów do potwierdzenia. Zanim powstanie ocena konkretnego przejścia, użytkownik musi potwierdzić konfigurację i rzeczywistą szerokość z wystającymi elementami, długość z podnóżkami oraz potrzebne miejsce manewrowe.
