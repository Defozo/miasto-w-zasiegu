# Iskry Miasta

Ten dokument opisuje ogród i trening dostępne pod `/gra?tryb=ogrod`, powiązane ze wspólnym kontem Miasta w zasięgu. Główny widok `/gra` przedstawia [misje i osiągnięcia odkrywców](ISKRY-EXPLORER.md). Gra nie wymaga podawania informacji medycznych.

## Pętla gry

1. Gracz wybiera małe odkrycie: treningową zagadkę albo obserwację w okolicy rzeczywistego miejsca.
2. Rozwiązuje zagadkę lub zapisuje konkretną, własną obserwację istniejącej przeszkody.
3. Otrzymuje iskry. W mieście przyznaje je serwer dopiero po sprawdzeniu raportu i jego autora.
4. Ogród zmienia się przy 15, 40 i 75 zdobytych iskrach. Pojawiają się kwiaty, drzewo, ławka i świetliki.
5. Gracz odblokowuje ozdoby i ustawia je na czterech grządkach. Może wrócić do kolejnego odkrycia.

Nie ma rankingów, utraty serii dni, kar za przerwę ani zegara w zagadkach. Iskra, rysunkowy ptak, podpowiada następny krok. Ruch chmur, ptaka i światła można zatrzymać. `prefers-reduced-motion` wyłącza animacje.

## Dwa oddzielne światy

**Trening** działa bez konta. Sześć autorskich, fikcyjnych zagadek dotyczy stopnia przy wejściu, wolnej szerokości przejścia, nierównej nawierzchni, braku danych o windzie, miejsca odpoczynku i wejścia bez schodów. Każda daje jednorazowo 20 lokalnych iskier. Błędna odpowiedź daje podpowiedź, bez utraty punktów. Stan zapisuje się w `localStorage` pod `iskry-miasta-training-v1`. Rozwiązywanie i dekorowanie nie wysyłają POST do API. Trening nie tworzy raportów, nie zmienia mapy i nie przenosi iskier do miejskiego ogrodu.

**Moje miasto** wymaga konta do odbierania nagród. Misje pochodzą z rzeczywistych miejsc zapisanych w lokalnym katalogu OSM. `/api/locations` pomaga wybrać okolicę na podstawie adresu, ulicy lub miejsca. Punkt adresowy lub przybliżony środek ulicy służy do wyboru okolicy, nie potwierdza położenia bariery. Gra wymaga świadomego potwierdzenia rzeczywistego miejsca obserwacji. Można wyszukać adres, kliknąć mapę, przeciągnąć pinezkę albo ustawić ją w środku mapy. GPS jest opcjonalny i uruchamia się wyłącznie po kliknięciu. Ręczne współrzędne są schowane w opcjonalnych szczegółach, nie stanowią głównej ścieżki wyboru miejsca. Gra przypomina, aby opisywać obserwację po zatrzymaniu się.

Misje dzielą się na przeszkody oraz dobre odkrycia. Filtry pozwalają wybrać oba rodzaje osobno. Dobre odkrycia dotyczą miejsca odpoczynku, konkretnego wejścia bez schodów oraz działania windy sprawdzonego w danym momencie. Trafiają wyłącznie do osobnej tabeli `observations`, nigdy do raportów przeszkód. Brak możliwości potwierdzenia ma własną akcję pominięcia bez utraty iskier. Odkrycie ławki lub wejścia dodaje też tematyczny element do ogrodu. Nie ma automatycznych zapisów w OSM ani wysyłania zgłoszeń do instytucji miejskich.

## Ekonomia

| Działanie | Iskry |
| --- | ---: |
| Zagadka treningowa, raz na zagadkę | 20 lokalnych |
| Pomiar istniejącego przewężenia | 20 |
| Obserwacja trudnej nawierzchni | 15 |
| Obserwacja trudnego progu lub krawężnika | 15 |
| Dobre odkrycie: odpoczynek, wejście lub sprawdzona winda | 15 |
| Pierwsze trzy różne rodzaje miejskich obserwacji | dodatkowe 10, raz |
| Łąka iskier | koszt 15 |
| Lampion odkrywcy | koszt 25 |
| Sadzawka spokoju | koszt 35 |
| Drzewo opowieści | koszt 45 |

Rozwój świata zależy od wszystkich zdobytych iskier. Zakupy zmniejszają tylko saldo do wydania. Raz odblokowaną ozdobę można ustawiać na różnych grządkach bez kolejnej opłaty. Trening ma skończoną pulę 120 iskier, która wystarcza do odblokowania czterech ozdób w dowolnej kolejności.

W mieście wspólnie dla przeszkód i dobrych odkryć obowiązuje limit pięciu nagród w ruchomym oknie 24 godzin oraz co najmniej 90 sekund między nagrodami. To ograniczenia nadużyć prototypu. Interfejs nie pokazuje odliczania ani nie zachęca do szybszego zgłaszania. Bonus różnorodności nie ma terminu.

## API i integracja

Moduł `server/game.mjs` eksportuje nazwany i domyślny `registerGameRoutes(app, context)`. Kontekst zawiera `db`, `store`, synchroniczne `getUser(req)` i opcjonalny zegar `now` dla testów. `registerObservationRoutes(app, context)` z `server/observations.mjs` rejestruje osobne API dobrych odkryć i korzysta z tej samej bazy oraz sesji. Rejestracja następuje przed obsługą 404. Gra używa tego samego uwierzytelniania Clerk co Miasto w zasięgu.

| Endpoint | Funkcja |
| --- | --- |
| `GET /api/game/state` | Saldo, zdobyte iskry, ukończone misje, odblokowania i grządki bieżącego użytkownika; dla gościa pusty stan |
| `GET /api/game/missions?q=&lon=&lat=` | Misje przy miejscach, filtrowane nazwą; opcjonalne współrzędne zmieniają kolejność według odległości |
| `POST /api/game/claim` | `{ reportId, missionId, expectedUserId }` albo `{ observationId, missionId, expectedUserId }`; dokładnie jedno źródło, zgodne z typem misji |
| `POST /api/game/decorate` | `{ itemId, slot, expectedUserId }`; odblokowanie lub ustawienie ozdoby |
| `GET /api/observations?type=&bbox=&limit=100` | Publiczne aktualne dobre odkrycia, limit maksymalnie 200; bbox: zachód,południe,wschód,północ |
| `GET /api/observations/mine` | Własna historia dobrych odkryć, także wygasłe i wycofane |
| `POST /api/observations` | `{ type, coordinates, description, observedNow: true, expectedUserId }`; własna bieżąca obserwacja |
| `POST /api/observations/:id/withdraw` | Wycofanie własnej obserwacji, z `expectedUserId` |
| `GET /api/locations?q=&limit=5` | Istniejąca wyszukiwarka adresów, ulic i miejsc używana do wyboru okolicy |
| `POST /api/reports` | Istniejący zapis obserwacji; gra wysyła również `expectedUserId` |

Stan miejskiej gry zapisuje SQLite w tabelach `game_claims`, `game_observation_claims`, `game_unlocks` i `game_decorations`. Istniejąca tabela raportowych nagród pozostaje nienaruszona. Pozytywne nagrody mają własny `observation_id`, a saldo, bonus i limity liczone są wspólnie z obu tabel. Wiersze obu typów nigdy nie są utożsamiane. Pole `reports.user_id` ustala serwer na podstawie sesji, nie treści żądania. Publiczny raport pokazuje `isMine`, bez publikowania identyfikatora konta autora.

Jeśli zapis raportu lub dobrego odkrycia powiedzie się, ale odebranie nagrody nie, interfejs zachowuje odpowiedni identyfikator `reportId` albo `observationId` przypisany do konta i misji. Ponowienie wywołuje samo `claim`, bez drugiego zapisu. Zmiana rodzaju misji nie pozwala wykorzystać wpisu z innej kolekcji.

## Bezpieczeństwo i jakość danych

Serwer sprawdza własność raportu, aktywny status, wiek do 24 godzin, zgodność rodzaju z misją i odległość do 180 metrów od orientacyjnego punktu miejsca. Wymaga opisu minimum 35 znaków, sześciu słów i pięciu różnych słów. Misja szerokości wymaga liczbowego pomiaru wolnego przejścia od 20 do 400 cm.

Identyfikator raportu lub dobrego odkrycia jest kluczem głównym w odpowiedniej tabeli nagród. Powtórzenie tego samego `claim` zwraca zero nowych iskier. Nowy identyfikator raportu nie omija blokady tej samej misji, skopiowanego opisu ani kolejnej obserwacji tego samego rodzaju w promieniu 35 metrów. Ograniczenia duplikatów dotyczą jednego konta. Serwer nie przyjmuje salda ani liczby punktów od klienta. Przyznanie nagrody i zakup korzystają z transakcji SQLite i unikalnego odblokowania dla konta oraz ozdoby.

`expectedUserId` chroni zapis przed zmianą sesji w drugiej karcie: niezgodność zwraca `409 ACCOUNT_CHANGED`. Nie jest metodą autoryzacji; rzeczywiste uprawnienia wynikają ze zweryfikowanej sesji Clerk i własności raportu. Po odzyskaniu fokusu gra odświeża konto i stan miejski, zachowując osobny lokalny trening.

**Walidacja zapisu nie jest terenową weryfikacją prawdziwości.** Prototyp nie potwierdza obecności gracza w miejscu i nie ma pełnego zaplecza moderacji, trwałych dowodów fotograficznych ani odporności na wiele kont ani wykrywania wszystkich parafraz duplikatów. Samo zaznaczenie potwierdzenia obserwacji nie jest dowodem. Raport lub dobre odkrycie może pozostać publiczne, nawet jeśli serwer odmówi przyznania punktów. Przyznane wcześniej iskry nie znikają po rozwiązaniu bariery lub wycofaniu dobrego odkrycia. Wycofanie jest korektą informacji, a nie sposobem wyzerowania historii duplikatów. Przed szerokim publicznym uruchomieniem potrzebne są moderacja, obsługa nadużyć i zasady korekty danych.

## Wybór punktu bez GPS

`GameLocationPicker.tsx` i `game-location.css` tworzą samodzielny, kontrolowany komponent. Kontrakt: `initialCenter`, `missionKey`, `accountKey`, `value`, `onChange` oraz opcjonalne `disabled`. `initialCenter` wyznacza jedynie widok mapy. Mapa nie zaznacza ani nie zatwierdza tego punktu automatycznie. `missionKey` i `accountKey` wyznaczają kontekst wyboru oraz anulowania starych zadań.

Komponent korzysta z istniejącego `AddressInput` i ładuje MapLibre dopiero po otwarciu rzeczywistej misji. Wybór adresu, kliknięcie mapy, przeciągnięcie pinezki, przesunięcie jej strzałkami lub GPS tworzy propozycję. Osobny przycisk „To miejsce obserwacji” ustawia potwierdzone `value`. Każda zmiana propozycji cofa potwierdzenie. Przycisk „Ustaw pinezkę w środku mapy” pozwala wybrać punkt po przesunięciu mapy klawiaturą. Podkład pochodzi z OpenFreeMap i zachowuje atrybucję.

Wynik GPS pokazuje deklarowaną dokładność. Spóźnione callbacki są ignorowane po zmianie misji, konta, odmontowaniu komponentu lub rozpoczęciu nowszego wyboru. Przed przyjęciem wyniku GPS komponent dodatkowo sprawdza aktualną sesję przez `/auth/me`, więc wylogowanie w drugiej karcie nie wstawia pozycji do wcześniejszego kontekstu. Potwierdzenie pinezki anuluje oczekujący wynik GPS. Brak GPS lub podkładu mapy nie wyłącza wyszukiwarki adresu. Wybrany adres nadal nie jest dowodem położenia wejścia.

Przewijanie ogrodu używa wspólnego `motionReduced()`, uwzględniającego system i ustawienie aplikacji. Mapa używa `jumpTo` i przybliżeń bez animowanego przelotu. Pasek rozwoju wyłącza również przejście na pseudoelementach przy ograniczeniu ruchu. Wykrycie zmiany sesji w odpowiedzi na GPS czyści propozycję pinezki, wpisany adres i współrzędne, zamiast pozostawiać prywatną lokalizację poprzedniego konta.

## Publiczne dobre odkrycia

- `rest_place`: miejsce odpoczynku, widoczność do 7 dni od zapisu.
- `step_free_entrance`: wejście bez schodów, widoczność do 24 godzin.
- `lift_working`: winda zadziałała przy sprawdzeniu, widoczność do 2 godzin.

To przyjęte okresy wygaśnięcia prototypu, a nie gwarancja aktualności ani godziny działania obiektu. Serwer zapisuje czas; klient nie może dowolnie go przesunąć. Nagrodę można odebrać w ciągu 24 godzin, tylko przed wygaśnięciem i przed wycofaniem wpisu. Brak schodów nie potwierdza szerokości drzwi, miejsca na manewr ani dostępności dalszej drogi. Działanie windy w chwili obserwacji nie obiecuje działania w przyszłości.

Publiczna odpowiedź nie zawiera identyfikatorów autorów, e-maili ani ich nazw. Pokazuje `isMine` tylko w odniesieniu do aktualnej sesji, `verification: unverified` i `affectsRouting: false`. Wycofane oraz wygasłe wpisy nie trafiają na publiczną listę. Autor może je obejrzeć w „Moje odkrycia” i wycofać czynny wpis. Historia pozostaje w bazie, aby uniemożliwić odnawianie nagród przez wycofywanie wpisów.

API tworzenia dobrych odkryć wymaga konta, bieżącego potwierdzenia obserwacji, poprawnych współrzędnych obszaru Krakowa i konkretnego opisu. Osobne trwałe limity zapisu: 10 nowych odkryć na konto w 24 godziny, 30 sekund odstępu, 1000 zapisów na konto i 50000 w prototypie. Obejmują również wycofane wpisy. Ta sama treść dla konta jest blokowana trwale, a ten sam rodzaj w promieniu 35 m przez 24 godziny. Późniejsze odświeżenie opisu miejsca nie daje drugiej nagrody za tę samą misję. Te reguły działają po ponownym uruchomieniu serwera, ponieważ wynikają z historii SQLite, a nie pamięci procesu.

Żaden z tych zapisów nie jest dodawany do `reports`, nie zmienia OSM, nie stanowi potwierdzonej przejezdności i nie wpływa na wybór trasy. Ewentualne wyświetlanie obserwacji jako oddzielnej warstwy mapy nie nadaje im statusu potwierdzonych danych.

## Dostępność i instalacja

### Album ogrodu

Album mieści trzy nazwane pocztówki zapisane wyłącznie w przeglądarce. Osobne klucze `iskry-miasta-album-v1:training` i `iskry-miasta-album-v1:account%3A<id>` oddzielają trening od kont. Dane nie synchronizują się między urządzeniami i znikają po wyczyszczeniu danych strony. Podział kluczy zapobiega mieszaniu albumów w interfejsie; nie jest szyfrowaniem ani ochroną przed osobą mającą dostęp do tej samej przeglądarki.

Snapshot zawiera numer miejsca, nazwę do 40 znaków, czas zapisu i parametry rysunku: próg wzrostu, dwa rodzaje odkryć mające elementy ilustracji oraz ozdoby na czterech grządkach. Nie zawiera współrzędnych, opisów obserwacji, szczegółów profilu, salda ani odblokowanego ekwipunku. `GameGarden.tsx` rysuje zarówno żywy ogród, jak i statyczne miniatury oraz większy podgląd. Otwierany przez użytkownika podgląd jest wyłącznie do oglądania: nie przywraca stanu i nie przyznaje iskier.

Zapis, usunięcie i zastąpienie nie wywołują API. Usunięcie oraz zastąpienie wymagają osobnego potwierdzenia; czwarta pocztówka nie usuwa poprzedniej automatycznie. Błąd zapisu pozostawia poprzednie dane i wpisaną nazwę, bez komunikatu sukcesu. Czytnik sprawdza strukturę, rozmiar i dozwolone elementy, a operacja przed zapisem ponownie odczytuje aktualny album. Zmiana pocztówki w innej karcie blokuje potwierdzenie oparte na starszym widoku.

Zmiana konta lub trybu od razu wymienia komponent albumu wraz z formularzem i podglądem. Miejski album pozostaje ukryty podczas ponownego sprawdzania sesji i po nieudanym sprawdzeniu; spóźniona odpowiedź wcześniejszego odświeżenia nie przywraca starszego kontekstu. Trening pozostaje osobny. Po sześciu zagadkach zaproszenie prowadzi do komponowania i zachowania ogrodu, z jasną informacją o odrębnym ogrodzie miejskim. Nie ma nagród za częstotliwość zapisu ani obowiązku nowych obserwacji.

`tests/e2e/game-album.spec.ts` sprawdza limit, podgląd z klawiatury, zastąpienie/usunięcie i trwałość bez zmian nagród, rozdzielenie kont oraz treningu, uszkodzone dane i odmowę zapisu lokalnego. Testy są odseparowane od publicznej bazy.

Przyciski są dostępne z klawiatury, grupy mają nazwy, zmiany wyniku są ogłaszane przez `role="status"`, a błędy przez `role="alert"`. Każda ilustracja zagadki ma opis tekstowy. Nie trzeba oceniać obrazu wzrokiem, aby ją rozwiązać. Po wyborze misji fokus przechodzi na jej nagłówek; na telefonie widok przewija się do rozgrywki. Przycisk startowy pozwala od razu zacząć zagadkę.

`web/public/iskry.webmanifest` ma osobne `id`, `start_url` i `scope` równe `/gra`, nazwę Iskry Miasta oraz własne ikony SVG i PNG 192/512. Komponent gry ustawia manifest i tytuł strony. Konfiguracja pozwala na osobną instalację PWA; działanie instalacji należy sprawdzić w docelowej przeglądarce i urządzeniu. Serwis worker i dystrybucja należą do wspólnej konfiguracji aplikacji.

## Testowanie

Testy ogrodu, albumu i obserwacji korzystają z izolowanych baz. Polecenia i ograniczenia oceny opisuje [TESTING.md](TESTING.md). Reguły nagród nie dowodzą prawdziwości obserwacji, a AXE nie zastępuje pełnego przebiegu czytnikiem ekranu.
