# Weryfikacja producentów, 3 października 2026

Sprawdzono 13 wybranych rekordów GKV. Wynik dla **szerokości całkowitej**: 4 zgodne, 2 rozbieżne, 7 nierozstrzygniętych. Jest to celowa próbka obejmująca trudne przypadki, a nie losowa próba pozwalająca oszacować jakość całego katalogu.

Ocena `match` dotyczy pola szerokości całkowitej i dopasowania modelu. Nie oznacza sprawdzenia wszystkich pól GKV, pomiaru egzemplarza ani gwarancji przejezdności. `Insufficient` zachowano również przy zgodnych liczbach, gdy nie udało się potwierdzić wariantu lub konfiguracji.

| Model | Wynik | Ustalenie |
|---|---|---|
| Quickie Q50 R | match | 600 mm, dokładny HMV w broszurze producenta, s. 12. Nie pomylono z Carbon. |
| Lexis light | conflict | Dokładny HMV; producent podaje siedzisko + 220 mm, GKV + 22 mm. Różnica 198 mm. |
| Eurochair Avanti 1.736-352/353 | insufficient | Producent: siedzisko + 200 mm; + 180 mm tylko z osłoną code 100. Kod osłony nie jest wskazany w GKV. |
| Sopur Xenon² | insufficient | Wariant historycznego art. 76800000 nie został potwierdzony. Formularz z 2025 r. zawiera formuły zależne od kół i pochylenia. |
| Avantgarde 4 DV | match | Dokładny artykuł; zakres 490-725 mm. |
| Motus 2 CV | match | Dokładny artykuł i HMV; zakres 505-680 mm. Osobne pole szerokości siedziska różni się między GKV a producentem. |
| Avantgarde 4 DV Teen | insufficient | Dokładny formularz HMV i artykułu podaje siedzisko, ale nie szerokość całkowitą Teen. Nie przeniesiono zakresu z dorosłego DV. |
| Ventus | match | Dokładny artykuł; zakres 450-850 mm. Osobne tabele pokazują wpływ konfiguracji. |
| Quickie Q700 M bez podnośnika | insufficient | Instrukcja Q700 M z kołami 14 cali podaje zgodne 622-660 mm. Nie potwierdzono konkretnego artykułu bez podnośnika. |
| Quickie Q200 R | insufficient | Instrukcja nowszego wariantu rozdziela podstawę 580 mm i zewnętrzną szerokość części siedzącej do 660 mm. Nie ustalono tożsamości historycznego artykułu. |
| Quickie Q500 M | insufficient | Instrukcja: 610-620 mm z kołami 13 cali; GKV wymienia koła 14 cali. |
| Quickie Q300 M Mini | conflict | Ten sam HMV; producent podaje 520-570 mm, a przy kołach 13 cali 540 mm. GKV podaje 610-620 mm. |
| M3 Corpus PPP z podnośnikiem | insufficient | Karta M3 Corpus z 2020 r.: podstawa 615 mm, całość z siedziskiem i podłokietnikami 650-790 mm. Nie potwierdzono artykułów wariantu PPP z GKV. |

Dwa potwierdzone konflikty:

- [Lexis light, strona Trendmobil](https://www.trendmobil.com/lexis-light-sb-51.html): HMV 18.50.02.2128, sekcja Technische Daten. Strona wskazuje jednostkę cm i wzór +22. Instrukcja Trendmobil z maja 2017 dostępna przez indeks web potwierdza ten wzór na s. 13; jej bezpośrednie pobranie od pośrednika zwróciło 404, dlatego podstawowym dowodem pozostaje strona producenta.
- [Q300 M Mini, broszura Sunrise Medical](https://www.sunrisedice.com/asset-bank/assetfile/59808.pdf): s. 20 zawiera HMV 18.50.04.0217 oraz szerokość 520-570 mm. S. 11 rozpisuje 12 cali = 520 mm, 13 cali = 540 mm, 14 cali = 570 mm. Dokument jest zapisany lokalnie z sumą SHA256.

Przykłady zależności:

- Xenon², formularz z 16.09.2025, pobrany 03.10.2026, s. 9: dla kół 24 cali szerokość to siedzisko +160/+210/+260 mm przy pochyleniu 0/2/4 stopnie; dla 25 cali +160/+220/+270 mm. Hamulec bębnowy dodaje 20 mm. Dokument podaje tolerancję 10 mm. Te wzory są dowodem złożoności konfiguracji, nie zweryfikowanym zamiennikiem historycznego rekordu GKV.
- Ventus, formularz 647F416=de_DE-41-2512, s. 4: tabela z obręczą komorową podaje pary siedzisko/szerokość 280/450 do 440/610 mm. W tych wierszach różnica wynosi 170 mm. Nie ekstrapolowano jej na inne rozmiary. S. 3 podaje dodatkowy wpływ pochylenia: dla kół 24 cali 3/6/9 stopni odpowiada +60/+120/+180 mm. Dla 22 cali przyrosty są mniejsze, a dla 25 cali większe.
- Q200 R, instrukcja szwedzka Rev I z 24.11.2025, s. 62: podstawa 580 mm; przy siedzisku 480 mm zewnętrzna szerokość części siedzącej wynosi 600-660 mm zależnie od podłokietników. Sam wymiar podstawy nie opisuje całej obwiedni.

Wnioski dla aplikacji:

1. Katalog może proponować model i wstępne parametry, ale nie powinien sam ustalać szerokości użytkownika z najniższego końca zakresu.
2. Przechowywać osobno szerokość siedziska, podstawy, całkowitą, rozmiar i pochylenie kół, podłokietniki, osłony i akcesoria. Formuła musi zachować warunki oraz źródło.
3. Rekord producenta i GKV pozostają odrębnymi twierdzeniami. Konflikt kierować do weryfikacji; nie nadpisywać automatycznie.
4. Ostateczny profil powinien zawierać potwierdzony przez użytkownika pomiar najszerszego punktu wózka w konfiguracji używanej podczas podróży. Wymagany luz przy przejściu jest osobnym parametrem, którego ten eksperyment nie ustala.

Dowody strukturalne są w `manufacturer-verification.json`. Manifest pobrań jest w `manufacturer-sources-manifest.json`, a lokalny log zawiera SHA256. Dokumenty pobrano i odczytano przez pypdf, a kluczowe tabele zweryfikowano również wizualnie. Pliki PDF/TXT są lokalnymi materiałami badawczymi i mogą być ignorowane przez Git. Dokumenty Q500 od Dahl Engineering oraz Q300 instrukcja od Better Mobility są autorstwa producenta, lecz mają host zewnętrzny; oznaczono to w JSON.

Rewizja dokumentu z pobranego pliku ma pierwszeństwo przed datą w wynikach wyszukiwania. Pod tym samym URL może pojawić się nowsza treść, dlatego zachowano wersje i sumy kontrolne. W badaniu nie kontaktowano się z producentami ani nie wykonano pomiarów fizycznych.
