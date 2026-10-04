# Miasto w zasięgu: plan realizacji v2

Rozszerzenie: wdrożone lokalnie paszporty obiektów, prywatne szkice, jawna publikacja, historia zmian, opcjonalne potwierdzenie domeny i widget wspólnej publicznej karty. [Przebieg, przepływ danych, API oraz ograniczenia walidacji](PLACE-PASSPORTS.md). Prezentacja i film pozostają odłożone.

Stan z 3 października 2026, po końcowym pakiecie web z godz. 10:42 UTC i raporcie fokusu TalkBack z godz. 10:45 UTC. Produkt w języku polskim dla Krakowa, z możliwością rozszerzenia na inne obszary po przygotowaniu danych i konfiguracji. Cel: pomóc zaplanować samodzielne wyjście na podstawie konkretnych potrzeb, barier i jawnych braków informacji. Kod działa lokalnie; publikacja internetowa jest kolejnym etapem. Bieżący pakiet integracji miejskiej i poprawek UX jest zakończony w opisanym niżej zakresie weryfikacji.

## Priorytety wynikające z aktualnego briefu

Podstawą jest [opis szczegółowy zadania](../official-2026-10-03/materials/d749aab48b0e2887.pdf.txt), a porównanie wymagań z kodem zawiera [audyt zgodności](TASK-AUDIT-2026-10-03.md). Pierwszy scenariusz dotyczy osób na wózkach i rodziców z wózkami dziecięcymi: określenie potrzeb, znalezienie miejsca lub trasy, ocena konkretnych faktów oraz braków danych. Sam routing ani oznaczenie „dostępne” nie wystarczają.

1. **Dane i ich pochodzenie.** Karty ZTP i panel „Skąd to wiemy?” przeszły odbiór, w tym stare dane, błąd aktualizacji i awaria przed pierwszym importem. Zachowane są daty zmiany rekordu, pobrania, wczytania lokalnej mapy i odrębne potwierdzenie terenowe. Od 4 października działa [harmonogram importu ZTP i OSM](DATA-IMPORT-SCHEDULE.md), z dziennikiem wyników i ponawianiem błędów. Następny zbiór dobierać według luki użytkownika, np. szczegółów wejścia do toalety, po sprawdzeniu praw i identyfikacji obiektów.
2. **Użyteczność głównego przepływu.** Bieżące testy web i ponowna kontrola poprawionego fokusu TalkBack są zakończone. Zachować tekstowy odpowiednik mapy, klawiaturę, kontrast i czytelne braki danych. Kolejne etapy walidacji to klawiatura ekranowa z czytnikiem, osoby o różnych potrzebach i teren; obecne wyniki nie są pełnym audytem WCAG.
3. **Utrzymanie poza UMK.** Dopasować istniejącą [hipotezę biznesową, PLAN §13](../PLAN.md) do obecnego produktu: operator, koszt hostingu/API/ORS, aktualizacje, weryfikacja i obsługa zgłoszeń. Opisać dodanie drugiego miasta i warunki źródeł. Nie zakładać ręcznej pracy Miasta ani przedstawiać hipotez jako pozyskanych klientów.
4. **Dodatki po podstawowym scenariuszu.** Gra, modele wózków, Android, Wear OS i przekazanie planowania między urządzeniami wspierają produkt, ale nie są obowiązkowymi platformami briefu. Dalszy rozwój nie powinien wypierać jakości danych i obsługi rzeczywistego wyjścia.

**Prezentacja PDF i film: ODŁOŻONE DECYZJĄ UŻYTKOWNIKA.** Formalne limity 10 slajdów i 3 minut oraz wymagania zgłoszenia pozostają zapisane w audycie; obecna praca dotyczy aplikacji i danych. Konflikt wag kryteriów, zasad wcześniejszych prac oraz nazwa innego projektu w załączniku praw wymagają wyjaśnienia z organizatorem. Nie rozstrzygamy dopuszczalności istniejącego kodu.

## Obecny zakres

1. Strona informacyjna z autorską animacją miasta, wejściem do aplikacji i gry. Bez zmyślonych rekomendacji, użytkowników lub partnerów.
2. Web na komputer i telefon oraz instalowalne PWA. Mapa, miejsca, rzeczywiste adresy, zapisane miejsca, pola początku i celu, do 5 przystanków, profil potrzeb, obliczanie trasy, zgłoszenia barier i osobne dobre odkrycia. Wpisany tekst wymaga zatwierdzenia podpowiedzi; po jego zmianie trzeba ponownie wybrać punkt.
3. Wspólne konto web i Android. Rejestracja jest opcjonalna. Bez konta profil pozostaje lokalny; konto służy do synchronizacji, własnych zapisów i gry miejskiej. Profil ma wersję, a zapis z nieaktualnej wersji zwraca konflikt. Użytkownik decyduje, czy pobrać ustawienia z drugiego urządzenia.
4. Android Kotlin/Compose: natywne adresy i przystanki, zapisane miejsca lokalne i kontowe, profil, konto, katalog modeli, trasa oraz próbne prowadzenie GPS z opcjonalnym TTS i usługą działającą po zablokowaniu ekranu. Podgląd manewrów jest oznaczony jako tryb bez GPS. Nie ma jeszcze automatycznego przeliczania trasy, natywnej mapy ani pełnej nawigacji.
5. Wear OS: opcjonalny ekran instrukcji telefonu, z wygaszaniem nieaktualnego stanu. Telefon działa samodzielnie. Kod i APK są przygotowane; odbiór na sparowanym zegarku pozostaje do sprawdzenia.
6. Iskry Miasta: osobna gra web/PWA pod `/gra`, ze wspólnym kontem i odrębnym, lokalnym treningiem.
7. Backend Node 24, Express i SQLite oraz lokalny ORS dla Małopolski. Konta, wersje profilu, zgłoszenia, historia, wyniki wyszukiwania modeli i postęp gry są zapisywane po stronie serwera. API pozostaje na localhost.

## Początek i profil potrzeb

Pierwszy ekran pozwala wybrać „Ustaw potrzeby” lub „Pomiń”. Profil opisuje sposób poruszania się, opcjonalną zmierzoną szerokość całkowitą, nachylenie, krawężniki i nawierzchnię. Nie wymaga diagnozy medycznej. Brak szerokości pozostaje brakiem pomiaru, a początkowe wartości pozostałych pól można zmienić.

Profil web zawiera również osobne ustawienia widoku: większy tekst, mocniejszy kontrast i ograniczenie ruchu. Nie wpływają na warunki wyznaczania trasy. Android korzysta z systemowego skalowania tekstu i nie ma własnych animacji.

Katalog 13 modeli zachowuje wyniki wcześniejszego porównania dokumentacji, także konflikty i zależność od konfiguracji. Dodatkowe wyszukiwanie AI otwiera dokumentację producentów i zwraca parametry ze źródłami, krótkim fragmentem uzasadniającym wartość, wariantem i datą. Do zewnętrznego API trafia nazwa modelu, nie profil konta. Wspólna pamięć wyników ogranicza ponowne wyszukiwanie; poprawny wynik jest używany przez 30 dni, a brak wyniku przez godzinę. Nowe wyszukiwanie wymaga klucza API na serwerze, przechowywanego w psst.

Źródło i cytat pomagają sprawdzić wynik, lecz nie czynią ekstrakcji automatycznym pomiarem. Nie utożsamiamy szerokości siedziska ani złożonego wózka z szerokością podczas przejazdu. Użytkownik sprawdza wariant i własny pomiar przed użyciem wartości. Zakres lub sprzeczność nie zamienia się w jedną zgadywaną liczbę. Odpowiedź nie nadpisuje samodzielnie profilu.

## Adresy, miejsca i trasy

Warstwa OSM zawiera 27 647 obiektów, w tym 14 019 ławek, oraz dodatkowo 139 045 rekordów lokalizacji: 120 515 adresów i 18 530 segmentów ulic. Źródłem jest istniejący plik OSM/Geofabrik dla Małopolski ze stanem 2026-10-01T20:22:06Z, a obszarem prostokąt Krakowa i okolicy. To nie jest liczba unikalnych budynków ani kompletny wykaz administracyjny. Import nie obejmuje wszystkich relacji OSM. Punkt adresu lub środek obiektu nie potwierdza dostępnego wejścia.

Od 3 października działa osobna warstwa 3298 przystanków ZTP, razem 30 945 miejsc w API. Pierwszy import zakończył się o 10:25:11 UTC. Loader i wyszukiwarka odczytują nowe snapshoty i usuwają wygasłe rekordy bez restartu; ZTP nie jest scalane automatycznie z OSM ani włączane do grafu ORS. Dane miejskie obejmują m.in. nawierzchnię peronu, rodzaj krawężnika i liczbę ławek/wiat. Nie podają wysokości krawężnika, szerokości wejścia ani gwarancji wjazdu do pojazdu. Ławki w liczniku przystanku nie stają się osobnymi punktami odpoczynku.

Import ZTP jest automatyczny, codziennie o 04:10 Europe/Warsaw. Dane OSM są odświeżane w niedzielę o 04:40. [Zakres i ograniczenia harmonogramu](DATA-IMPORT-SCHEDULE.md). Błąd pobrania zachowuje ostatni poprawny zestaw z jego datami i jawnym statusem. [MUNICIPAL-STOPS](MUNICIPAL-STOPS.md) opisuje konkretny zbiór, warunki, walidację i ograniczenia. Inne miejskie źródła, w tym toalety ZIW/MSIP i adresy EMUiA, pozostają researchem. Karta miejsca ma panel [PlaceEvidence](../web/src/PlaceEvidence.tsx): zmiana wpisu, „Pobrano do aplikacji” dla ZTP, „Wczytano do aplikacji” i stan mapy dla OSM, osobno brak sprawdzenia terenowego. Testy web potwierdziły kartę, awarię z zachowaną kopią i komunikat braku warstwy przed pierwszym importem. Konwersje miejsca na punkt planu i zapisanego celu zachowują rzeczywiste źródło zamiast domyślnie przypisywać OSM.

Kilka punktów z tym samym adresem zachowuje odrębne współrzędne i źródła. Lista pokazuje nazwę powiązanego obiektu albo informację „punkt adresowy”, a pomocniczy opis wyjaśnia różnicę. Długa 12 ma oddzielnie Fornir i punkt adresowy; Rynek Główny 1 zachowuje m.in. Noworolskiego, Wieżę Ratuszową i Rynek Podziemny. Nazwa obiektu pomaga wybrać punkt, ale nie zamienia go w zweryfikowane wejście.

Zapisane miejsca pozwalają nadać wybranemu punktowi nazwę Dom, Praca lub własną, a potem użyć go jako startu, celu albo przystanku. Wpis gościa pozostaje na urządzeniu. Zalogowana osoba korzysta z prywatnej listy tego samego konta w web i Androidzie; logowanie nie importuje automatycznie zapisów gościa. Limit to 30 wpisów. Duplikat nazwy i współrzędnych nie tworzy kopii ani nie nadpisuje źródła. Usuwanie jest potwierdzane, a lista konta może być odświeżona po zmianach na drugim urządzeniu. Źródła i właściwy adres pozostają przy punkcie niezależnie od własnej nazwy. Kontrakt i granice prywatności opisuje [FAVORITES.md](FAVORITES.md).

Trasa zachowuje kolejność początku, wybranych przystanków i celu, z maksymalnie 5 punktami pośrednimi. Backend najpierw wybiera świeże zgłoszenia w buforze 500 m wokół kolejnych segmentów, a potem sprawdza również rzeczywisty przebieg objazdu. Zwykle wystarcza jedno żądanie do ORS; dodatkowe przeszkody w pobliżu objazdu mogą wymagać ponownego obliczenia, najwyżej 3 żądań łącznie. Limit 100 obszarów dotyczy zgłoszeń wybranych dla tego przejazdu, nie całego miasta. Limit 20 km dotyczy sumy prostych odległości między kolejnymi punktami. Błąd lub brak trasy pozostaje widoczny; aplikacja nie tworzy zastępczej prostej linii ani po cichu nie łagodzi wymagań. Zasady filtrów nawierzchni, ograniczenia i dowody testów opisuje [ROUTING.md](ROUTING.md).

Zgłoszenia użytkowników mają czas i stan. Świeże obserwacje mogą wpływać na omijanie odcinków; stare pozostają widoczne bez automatycznego blokowania trasy. Konto kontroluje własne zgłoszenia. Anonimowe wpisy są nadal częścią lokalnego prototypu i wymagają osobnego rozwiązania przed publikacją.

Dobre odkrycia stanowią oddzielne wpisy o odpoczynku, wejściu bez schodów lub działaniu windy w chwili sprawdzenia. Są widoczne na mapie i liście web, wygasają zależnie od typu oraz mogą zostać wycofane przez autora. Historia autora pozostaje prywatna, a publiczna lista nie ujawnia danych jego konta. Dobre odkrycie nie jest przeszkodą, nie wpływa na wyznaczanie trasy i nie potwierdza jej przejezdności. Szczegóły aktualności i reguł zapisów są w [GAME.md](GAME.md).

Mapa jest oddzielna od obliczania tras. PWA zachowuje własny interfejs i trasę zapisaną przez użytkownika. Plan kontowy otwieramy po sprawdzeniu jego właściciela przez internet. Gość lub osoba jawnie wybierająca dostęp bez logowania może zachować instrukcje offline dla użytkowników danego urządzenia. Data planu dotyczy obliczenia, nie ostatniego kliknięcia zapisu. Zapis można usunąć z potwierdzeniem. Szczegóły prywatności i ograniczeń są w [SAVED-PLANS.md](SAVED-PLANS.md).

Nowe trasy, konta i zgłoszenia wymagają backendu. Kafelki nie są masowo pobierane ani przechowywane przez service worker; nie mamy mapy ani grafu do samodzielnego routingu offline. Wyznaczona trasa ma czytelne znaczniki A, B i przystanków, bez grup niepowiązanych miejsc. Przejście do Odkrywaj i oglądanie miejsc nie kasuje planu; dopiero świadomy wybór nowego celu unieważnia poprzednie obliczenie.

## Indywidualny czas przejazdu

Android po rzeczywistej sesji GPS może zaproponować zapis dystansu, zmierzonego czasu, użytego profilu i oceny użytkownika. Wymaga zalogowania, osobnego potwierdzenia zgody i oceny na końcu. Podgląd ręczny, emulator, mock GPS i sesja ze zbyt małą ilością danych nie mogą być wysłane jako rzeczywisty przejazd. Nie wysyłamy surowych pozycji ani geometrii przejazdu.

Serwer potrzebuje co najmniej 3 kwalifikujących się próbek tej samej osoby i tego samego profilu: ukończonych, ocenionych jako przejezdne, o dystansie co najmniej 100 m i czasie co najmniej 60 s. Stosuje dalsze granice jakości, bierze ostatnie 20 próbek, odrzuca odstające wartości względem mediany i wygładza wynik metodą EWMA z wagą 0,25. Bez wystarczających danych używa czasu ORS.

To dopasowanie przewidywanego czasu, nie nauka dostępności. Nie zmienia geometrii, ograniczeń ani ostrzeżeń. Serwer nie weryfikuje śladu GPS i nie potwierdza samodzielnie rzeczywistego przejazdu. Dane należą do konta, nie są anonimowe ani łączone z innymi osobami. Właściciel może usunąć historię i wyuczone tempo. Zapis rzeczywistego przejazdu pozostaje do sprawdzenia na fizycznym urządzeniu.

## Iskry Miasta

Gra ma własny manifest PWA i ikonę. Gracz zbiera iskry oraz odblokowuje ozdoby dla czterech grządek ogrodu. Trening bez konta zawiera sześć fikcyjnych zagadek: stopień, dokładny pomiar szerokości, nierówna nawierzchnia, brak informacji o windzie, miejsce odpoczynku i wejście bez schodów. Wynik zostaje na urządzeniu i nie dodaje prawdziwych obserwacji. Iskry treningowe nie przechodzą do trybu miejskiego. Szczegóły ekonomii, dostępności i ograniczeń są w [GAME.md](GAME.md).

Tryb „Moje miasto” wymaga konta. Misje dotyczą rzeczywistych miejsc: przeszkód albo dobrych odkryć. Filtry pozwalają wybrać oba rodzaje osobno. Gracz wskazuje dokładny punkt, opisuje konkretną obserwację i potwierdza ją po zatrzymaniu się. Brak przeszkody lub pewności pozwala wyjść bez zgłoszenia. Pomiar szerokości wymaga podania wyniku pomiaru, nie oszacowania ze zdjęcia. Dobre odkrycia mają osobną listę i własną historię z możliwością wycofania; odblokowane wcześniej iskry nie zastępują aktualności informacji.

Punkty przyznaje serwer po sprawdzeniu właściciela, rodzaju, świeżości, położenia i treści zapisu. Zapobiega ponownemu punktowaniu tego samego zgłoszenia i ogranicza podobne wpisy. Limit to 5 nagradzanych obserwacji w 24 godziny i przerwa co najmniej 90 sekund. Punkty oznaczają zapis spełniający te reguły, nie niezależne sprawdzenie w terenie. Nie ma publicznego rankingu, serii dni ani wymagania codziennej gry. Gra nie zmienia OSM i nie wysyła zgłoszeń do miasta.

## Zasady interfejsu i granice

- Główne działania opisujemy zwykłym językiem; nazwy dostawców, dane źródłowe i szczegóły techniczne są w rozwijanych informacjach.
- Nie określamy trasy jako bezpiecznej ani sprawdzonej na podstawie samego routingu. Brak pomiaru pozostaje brakiem danych. Wejście, toaleta, godziny i możliwość samodzielnej obsługi wymagają osobnych informacji.
- Główne działania są dostępne bez mapy. Duże cele dotykowe, etykiety, klawiatura, fokus, czytelne błędy i informacja przekazywana także poza kolorem. Animacje mają pauzę i respektują ograniczenie ruchu.
- Lokalizacja jest pobierana na żądanie. Można wybrać adres bez GPS. Gra zachęca do obserwacji po zatrzymaniu, bez ryzykownej eksploracji.
- Agent telefoniczny i automatyczna ekstrakcja Street View pozostają poza MVP. Otwarcie dialera nie oznacza dostępu AI do rozmowy przez kartę SIM. Zdjęcia i dalsze integracje wymagają sprawdzonego pochodzenia oraz praw do użycia.

## Sprawdzenie i dalsza kolejność

Bieżące wyniki są w [VERIFICATION.md](VERIFICATION.md), a osobny zakres telefonu i zegarka w [ANDROID.md](ANDROID.md). Sprawdzenie obejmuje build web, API z rzeczywistym ORS, konflikty profilu, izolację kont, przystanki, model czasu, reguły gry, testy przeglądarki i emulatora. Testy używają oddzielnych baz. Build zegarka nie zastępuje testu dostarczenia instrukcji.

Aktualny backend ma 90/90 testów z ORS, bez pominięć. [Pełny przebieg web z godz. 10:29 UTC](../artifacts/e2e-runs/2026-10-03T10-29-06-335Z-58821b28/runner-summary.json) miał 51 PASS i 2 FAIL na 53 testy; dwa testy profilu używały starej etykiety przycisku. Po poprawce ARIA i testów [pakiet z godz. 10:38 UTC](../artifacts/municipal-final-report.json) przeszedł 16/16. Po naprawie pierwszej awarii ZTP i zachowania źródła celu [końcowy pakiet z godz. 10:42 UTC](../artifacts/municipal-recovery-report.json) przeszedł 12/12: 3 scenariusze miejskie, 6 zapisanych miejsc i 3 odpoczynku. Nie powtórzono całego zestawu 53 testów po ostatnich poprawkach. Przebiegi częściowo się pokrywają i nie są sumowane do liczby unikalnych testów; wcześniejsze 46/46 jest wynikiem historycznym.

[Raport TalkBack](../android/evidence/talkback-summary.json) potwierdza podstawowy scenariusz na emulatorze API 36. [Końcowy raport fokusu](../android/evidence/talkback-focus-summary.json) potwierdza stabilność wyboru adresów i wyniku, odczyt błędu sieci, usunięcie starej trasy i ponowienie po odzyskaniu połączenia. Na końcowym APK ponownie przeszły build debug, 32/32 JVM i lint bez błędów, z 24 ostrzeżeniami. Komunikaty czytnika obserwowano przez Display speech output, tekst wpisywano pomocniczo przez ADB. Nie testowano akustycznie głośnika ani pisania klawiaturą ekranową z TalkBack; historycznych kontroli TTS nie powtarzano. Pełny zakres i ograniczenia opisuje [ANDROID](ANDROID.md).

**Historia, 3 października przed 10:25 UTC:** plan i audyty opisywały aplikację bez aktywnej miejskiej warstwy danych oraz bez wykonanego testu TalkBack. Te luki zostały częściowo zamknięte; nie oznacza to automatycznej synchronizacji, pełnej zgodności WCAG ani potwierdzenia dostępności w terenie.

Poniższe zadania pozostają na późniejszy etap. Nie są rozpoczynane w ramach zakończenia tego pakietu:

1. Testy z osobami o różnych potrzebach: cała droga do właściwego wejścia, toalety i odpoczynku, czytnik, powiększona czcionka i odmowa uprawnień. Bez tego nie deklarujemy sprawdzonej nawigacji terenowej.
2. Moderacja i potwierdzanie obserwacji, obsługa sprzecznych faktów i zasady anonimowych wpisów. Terminy ważności i limity już istnieją, lecz nie zastępują odpowiedzialnego procesu kontroli danych.
3. Publiczne wdrożenie: HTTPS, hosting backendu i ORS, kopie zapasowe, prywatność, weryfikacja e-mail, odzyskiwanie kont i dalsze limity. Dopiero wtedy konfigurujemy APK pod publiczny endpoint. Obecny localhost nie jest publiczną usługą.
4. Test rzeczywistego zapisu sesji i zgody na telefonie, kontrola dokładności pomiaru i szacowanego czasu; następnie mapa, automatyczne przeliczanie i zgłoszenia w Androidzie. S26 Ultra oraz słabszy telefon, sparowany Wear OS, utrata połączenia i dłuższa praca są dalszym zakresem walidacji, nie warunkiem demonstracji webowego prototypu.

