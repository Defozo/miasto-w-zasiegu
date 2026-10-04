# Utrzymanie i model biznesowy

Miasto w zasięgu jest publicznym prototypem dla mieszkańców i turystów, w pierwszej kolejności osób na wózkach oraz rodziców z wózkami dziecięcymi. Wartością produktu jest możliwość samodzielnego porównania potrzeb z konkretnymi warunkami miejsca i drogi, także wtedy, gdy dane są niepełne lub sprzeczne.

Dokument opisuje istniejące elementy produktu oraz proponowany model stałego utrzymania po hackathonie. Przypisanie ról, budżet i czasy obsługi poniżej są planem pilotażu, a nie zawartą umową, działającym dyżurem ani deklaracją pozyskanych klientów.

## Operator i odpowiedzialność

Za obecną aplikację odpowiada zespół projektu. Dla płatnego pilotażu proponujemy jednego wskazanego operatora produktu, np. spółkę lub organizację prowadzącą usługę. Operator zawiera umowy z dostawcami, prowadzi kontakt z użytkownikami i odpowiada za ciągłość działania. Miasto pozostaje dostawcą wybranych publicznych danych; model nie wymaga infrastruktury UMK, dostępu do wewnętrznych systemów ani ręcznej obsługi naszej bazy przez urzędników.

| Rola operatora | Obowiązki w pilotażu |
| --- | --- |
| Właściciel produktu | Zakres usługi, umowy, ceny, polityka prywatności, kontakt i rozliczenia |
| Osoba techniczna | Hosting, sekrety, wdrożenia, monitorowanie API/ORS, kopie i odtwarzanie |
| Opiekun danych | Importy, kontrola dat i licencji, nieudane aktualizacje, konflikty źródeł |
| Moderator i wsparcie | Zgłoszenia błędów, nadużycia, kontakt z autorem lub obiektem, dokumentowanie korekt |
| Weryfikator terenowy | Uzgodnione pomiary konkretnych wejść i odcinków z datą, metodą i zakresem |

Jedna osoba może pełnić kilka ról w małym pilotażu, ale zastępstwo techniczne i dane kontaktowe muszą być wskazane przed uruchomieniem zobowiązań wobec klientów. Proponowany cel obsługi w dni robocze: ocena awarii usługi w ciągu 4 godzin, zgłoszenia niebezpiecznej lub sprzecznej informacji tego samego dnia, zwykłej korekty w ciągu 2 dni. To cele organizacyjne do uzgodnienia, nie aktualne SLA.

## Hosting poza UMK

Istniejąca architektura to React/PWA, jeden proces API Node.js/Express z SQLite, osobne importery oraz dwa silniki openrouteservice: przejazd zgodny z potrzebami i odcinek samochodowy. Android zawiera wspólny interfejs oraz natywne prowadzenie GPS; zegarek odbiera instrukcje z telefonu. Publiczny serwer wydaje statyczny build i API za reverse proxy HTTPS.

Dla stałego pilotażu proponujemy własny VPS w UE z trwałym dyskiem oraz osobną przestrzeń na szyfrowane kopie. Rozmiar 4-8 vCPU, 16-32 GB RAM i 100-200 GB SSD jest punktem wyjścia do pomiaru obciążenia, nie potwierdzoną minimalną konfiguracją. Dwa grafy ORS i ich przebudowa wymagają oddzielnego pomiaru pamięci oraz miejsca. W razie potrzeby ORS otrzymuje osobną maszynę. Bazy, sekrety i kopie pozostają poza katalogiem publicznych plików.

Wdrożenie obejmuje archiwizację poprzedniego buildu, kopię bazy przed migracją, budowę i testy w odrębnym katalogu, podmianę aplikacji, restart właściwego procesu i kontrolę przez publiczny HTTPS. Sprawdzenie ma objąć mapę, listę miejsc, jedną trasę, logowanie na własnym koncie testowym i dostęp do APK. Przy błędzie wraca poprzedni build; cofanie bazy wymaga osobnego uzgodnienia, aby nie zgubić nowszych zgłoszeń. Szczegóły konfiguracji są w [instrukcji wdrożenia](PUBLIC-DEPLOYMENT.md).

## Kopie i odtwarzanie

Proponowana polityka pilotażu: spójna kopia SQLite raz dziennie i przed każdą migracją, 14 kopii dziennych oraz 4 tygodniowe poza serwerem aplikacji. Nie kopiujemy samego otwartego pliku SQLite z pominięciem stanu WAL; używamy mechanizmu backupu SQLite lub kontrolowanego zatrzymania zapisów. Kopie obejmują dane użytkowników, paszporty i ich historię, zgłoszenia, postęp oraz stan powiązań płatniczych. Sekrety są odtwarzane osobno z menedżera sekretów.

Zachowujemy manifest źródeł, wskaźnik aktywnej generacji OSM i ostatnie poprawne pliki ZTP. Dane publiczne można ponownie zaimportować, lecz nie zastępuje to kopii społecznościowej bazy. Grafy ORS należy odtwarzać z przypisanego PBF i konfiguracji albo z zachowanej zgodnej kopii grafu.

Docelowe parametry małego pilotażu: RPO do 24 godzin i RTO do 8 godzin. Raz w miesiącu operator odtwarza kopię na izolowanym serwerze i sprawdza integralność bazy, liczbę zapisów, przykładowy paszport i trasę. Repozytorium nie potwierdza uruchomienia takiej polityki, kopii poza serwerem ani przeprowadzenia próby odtworzenia.

## Aktualizacja i weryfikacja danych

Harmonogram ZTP jest przygotowany na codzienny import o 04:10, a OSM na niedzielę o 04:40, w strefie Europe/Warsaw. Wymiana grafów ORS jest odrębną czynnością. Obecne skrypty Windows wymagają działającej sesji właściciela; przeniesienie na usługę systemową jest elementem wdrożenia stałego. Importery walidują kompletność i daty, zachowują ostatnie poprawne dane oraz sygnalizują błąd. [Dokładny przepływ](DATA-IMPORT-SCHEDULE.md), [zbiory i warunki](DATA-SOURCES.md).

Opiekun danych codziennie sprawdza ostatni sukces importu i komunikaty nieświeżości. Przy awarii zachowuje poprzednie dane z rzeczywistą datą, ponawia import po rozpoznaniu przyczyny i nie oznacza ich jako nowo potwierdzonych. Zmiana schematu lub licencji blokuje nowy adapter do czasu oceny.

Paszporty zachowują źródła i historię cech. Zgłoszenia pozwalają zapisać ponowne potwierdzenie i rozbieżność, a autor może poprawić lub zamknąć własny wpis. Punktów gry nie traktujemy jako dowodu prawdziwości. Proponowany pilotaż terenowy obejmuje najczęściej wybierane wejścia, toalety i przesiadki: dwie osoby zapisują metodę, wynik pomiaru i datę, a konflikt pozostaje widoczny do wyjaśnienia. Zmiana godziny importu nie odnawia daty takiego sprawdzenia.

Nie ma obecnie pełnego zaplecza moderatorskiego ani niezależnego potwierdzania każdego wpisu. Przed stałą usługą operator powinien uruchomić publiczny kanał korekt i nadużyć, kolejkę z numerem sprawy, ograniczone role moderatorskie i dziennik decyzji. Dane testowe nie mogą trafiać do zwykłej bazy.

## Prywatność i bezpieczeństwo

Konto i sesje obsługuje Clerk; aplikacja nie zbiera haseł. SQLite przechowuje powiązanie konta, ustawienia, zapisane miejsca, dobrowolne podsumowania przejazdów oraz zgłoszenia i ich historię. Potrzeby użytkownika nie wymagają diagnozy. Adresy zapisanych miejsc mogą być prywatne i wymagają ograniczonego dostępu oraz ochrony kopii.

GPS prowadzenia pozostaje na telefonie. Dobrowolny zapis podsumowania nie wysyła surowego śladu trasy. Lokalny plan offline i album są zapisane na urządzeniu; podział na konta w interfejsie nie jest szyfrowaniem pamięci przeglądarki. Szczegóły: [zapis planu](SAVED-PLANS.md), [logowanie](AUTH.md), [przepływ danych zewnętrznych](accessibility-data-flow.json).

Zdjęcie przesłane do opcjonalnej analizy AI jest pozbawiane metadanych i nie trafia do publicznego wpisu ani trwałej bazy zdjęć aplikacji. Retencja dostawcy AI jest odrębna. Google otrzymuje dane połączenia oraz wybrany punkt po otwarciu swojego widoku. Stripe otrzymuje dane rozliczeniowe, bez profilu potrzeb i obserwacji.

Operator utrzymuje HTTPS, dokładne originy Clerk, podpisy webhooków, limity żądań, odrębne środowiska test/live oraz sekrety poza repozytorium. Aktualizacje zależności poprzedza testami izolacji kont i konfliktów. Przed płatnym pilotażem trzeba uzgodnić okresy retencji, obsługę eksportu/usuwania danych, umowy z dostawcami oraz procedurę incydentu. Niniejszy opis nie zastępuje polityki prywatności ani nie potwierdza certyfikacji bezpieczeństwa.

## Finansowanie oparte na obecnym produkcie

Kod zawiera następujące oferty, obecnie demonstrowane w trybie testowym Stripe:

| Oferta | Cena w kodzie | Zakres |
| --- | ---: | --- |
| Bezpłatne korzystanie | 0 zł | Wyszukiwanie, potrzeby, fakty o miejscach i planowanie |
| Premium | 10 zł/mies. | Usunięcie płatnych wyróżnień i sponsorowanej kolejności |
| Reklama obiektu | 49 zł/mies. | Wyróżnienie miejsca na mapie po zastosowaniu filtrów |
| Reklama i wyniki sponsorowane | 99 zł/mies. | Wyróżnienie mapy i oznaczony priorytet w wynikach |
| Wsparcie jednorazowe | 5-1000 zł | Wpłata bez odnowienia i bez nadania Premium |

Płatność nie zmienia danych o dostępności, nie omija filtrów potrzeb i nie kupuje statusu potwierdzenia. W jednym zestawie wyników aplikacja wyróżnia najwyżej pięć miejsc, a podczas wyszukiwania lub wyboru kategorii nadaje najwyżej dwóm z nich priorytet sponsorowany. To limit jednoczesnej ekspozycji w danym zestawie, nie limit liczby wykupionych kampanii. Emisja zależy od kryteriów, widoku i kolejności dopasowanych miejsc; abonament nie gwarantuje wyświetlenia w każdym zapytaniu. [Mechanizm płatności](BILLING.md) wiąże uprawnienie z opłaconą fakturą i podpisanym webhookiem. Sam powrót z Checkout nie nadaje dostępu.

Przed prawdziwymi opłatami operator musi skonfigurować osobny tryb live, własne rozliczenia, zasady reklamacji i zwrotów oraz wykonać rzeczywisty odbiór płatności w odpowiednim środowisku. Testowy cennik nie jest dowodem przychodów.

Proponowane dodatkowe finansowanie to odpłatna obsługa paszportu obiektu: organizacja pomiaru, pomoc w publikacji widgetu i regularne przypomnienie o aktualizacji. Odbiorcami mogą być hotele, obiekty kultury, organizatorzy wydarzeń i zarządcy. Integracja z systemami rezerwacyjnymi, abonament wieloobiektowy i sponsorowane programy sprawdzania danych wymagają osobnej realizacji i umów. To kierunki sprzedaży do sprawdzenia, bez deklaracji obecnych klientów.

## Założenia kosztów pilotażu

Poniższe kwoty są budżetem planistycznym jednego miasta z niewielkim ruchem, nie ofertą dostawcy ani zmierzonym rachunkiem. Operator powinien zastąpić je cenami wybranej infrastruktury i miesięcznymi pomiarami przed zawarciem umów. Podatki, prowizje od płatności i koszt wytworzenia nowych funkcji wymagają oddzielnego rozliczenia.

| Pozycja | Założenie miesięczne |
| --- | ---: |
| Serwer API, dysk i dwa silniki tras | 300-700 zł |
| Kopie poza serwerem, monitoring i rezerwa domeny | 50-150 zł |
| Limit budżetu AI, logowania i usług mapowych | 100-400 zł |
| Razem infrastruktura i usługi | 450-1250 zł |
| Obsługa techniczna i danych: 12-20 h po 120 zł | 1440-2400 zł |
| Pomiary/obsługa terenowa: 8-16 h po 80 zł | 640-1280 zł |
| Razem z pracą operatora | 2530-4930 zł |

Przykładowy scenariusz, wyłącznie do sprawdzenia modelu: 150 Premium, 20 reklam po 49 zł i 10 reklam po 99 zł daje 3470 zł wpływów miesięcznie przed podatkami i prowizjami. Mieści się to wewnątrz powyższego zakresu kosztów, więc nie gwarantuje rentowności. Wzrost kosztu pozyskania klienta, terenowej weryfikacji lub AI wymaga większych przychodów albo umowy na obsługę obiektów. Wpłat jednorazowych nie traktujemy jako stałego pokrycia kosztów.

## Skalowanie i zależności

Drugie miasto wymaga właściwego PBF, granic walidacji, nowych grafów ORS, listy źródeł i licencji, adapterów miejskich oraz prób terenowych reprezentatywnych wejść i tras. Wspólne komponenty potrzeb, paszportów, gry i płatności można wykorzystać ponownie. Obecne granice Krakowa i etykiety miasta wymagają zmian konfiguracji lub kodu; nie ma automatycznego przełącznika dowolnego miasta.

Obecny jeden proces i SQLite wystarczają do prototypu. Wiele instancji API wymaga wspólnego magazynu transakcyjnego, współdzielonych limitów i kolejki zdarzeń płatniczych. Przeniesienie danych do innej bazy musi zachować identyfikatory kont, wersje, historię i metadane źródeł.

Node/React, pliki importów i SQLite pozwalają zmienić hosting bez infrastruktury UMK. Własne ORS ogranicza zależność od zewnętrznego API tras; OpenFreeMap pozostaje dostawcą podkładu, a Clerk, OpenAI, Google i Stripe są oddzielnymi zależnościami usługowymi. Zastąpienie Clerk wymaga migracji tożsamości; zmiana Stripe migracji rozliczeń. Wyłączenie AI lub podglądów Google pozostawia ręczny opis potrzeb, dostępne dane źródłowe i routing.

Licencje danych i zależności trzeba zachować przy każdej dystrybucji. Publiczna dostępność repozytorium sama nie ustala licencji kodu ani prawa do dalszej sprzedaży. Dane OSM podlegają ODbL, ZTP warunkom własnego portalu, a treści dostawców ich osobnym zasadom opisanym w [DATA-SOURCES.md](DATA-SOURCES.md).
