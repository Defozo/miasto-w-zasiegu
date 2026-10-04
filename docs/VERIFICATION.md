# Stan wykonania i sprawdzenia

3 października 2026, kolejne iteracje lokalnego Przejścia i Iskier Miasta. Rozróżniamy działający kod, test emulatora i niewykonane testy terenowe. Trwa dalsze udoskonalanie aplikacji.

Aktualizacja logowania: aplikacja korzysta z integracji Clerk. Poniższe wcześniejsze testy scrypt i formularzy haseł opisują poprzednią wersję. Bieżący zakres i ograniczenia OAuth: [AUTH.md](AUTH.md).

## Street View przy krokach trasy, 3 października, 18:23 CEST

- `npx tsc --noEmit`, produkcyjny build Vite do `artifacts/street-view/dist` i generowanie service workera: PASS. Główny build nie został zastąpiony testowym artefaktem.
- `npx playwright test --config playwright.street-view.config.ts`: 5/5 PASS. Kierunek kamery, punkt początku skrętu, powtórzone wierzchołki i cel; brak współrzędnych; otwieranie pojedynczej ramki na żądanie; klawiatura i utrzymanie fokusu; 1440/390 px; awaria konfiguracji, ponowienie, offline i zamknięcie starego podglądu po przeliczeniu trasy.
- Testy automatyczne używały bazy w pamięci i testowej ramki Google. Fikcyjna geometria nie trafiła do Google ani do zwykłej bazy. AXE sprawdziło listę kroków i kontrolowaną ramkę. Nie wykonano testu czytnikiem ekranu ani pełnego audytu dostępności interfejsu Google.
- Maps Embed API włączono w istniejącym projekcie, dopisując tę usługę do ograniczeń obecnego klucza. Domeny i limity płatnych usług pozostały bez zmian. Odczyt po zmianie: `artifacts/street-view/google-configuration.json`.
- Podczas sprawdzania zakresu publikacji równoległe wdrożenie zaktualizowało publiczny build i zawierało już Street View. Nie zastąpiono go starszym źródłem ani oddzielnym buildem przygotowanym w tym zadaniu.
- `node scripts/check-street-view-app.mjs --published`: rzeczywista publiczna aplikacja, rzeczywista trasa Długa 12 do Rynek Główny 1, 10 kroków. Przy instrukcji „Skręć w lewo” podgląd dla `50.066412,19.938965`, kierunek `82.9°`, wyświetlił zdjęcia ulicy Google opisane „1 Długa”. Sprawdzono 1440 i 390 px. Raport: `artifacts/street-view/real-route-verification.json`; obrazy: `real-route-desktop.png` i `real-route-mobile.png` w tym samym katalogu.
- Osobny test punktu przy Sukiennicach zwrócił panoramę wnętrza. Ten rzeczywisty brak zgodności z oczekiwanym widokiem ulicy uwzględniono w komunikacie. Osadzenie najbliższej panoramy nie gwarantuje właściwej strony ulicy, aktualnej daty ani przejezdności.

## Przebudowa z mapą jako głównym ekranem, 3 października

Wyniki wcześniejszych przebiegów poniżej są historyczne. Nie oznaczają ponownego sprawdzenia całej aplikacji po przebudowie.

- Backend: 137 testów, 135 PASS, 2 pominięte testy ORS wymagające opt-in. Po ostatnich zmianach budżetu czasu i projekcji paszportów dodatkowo 30/30 PASS w `redesign`, `routing-regressions`, `place-passports`, `passport-integration`.
- Rzeczywiste silniki ORS: trzy warianty podróży samochodowej z dalszym odcinkiem w Krakowie, zapis w `artifacts/journey-real-ors.json`. Punkty przesiadki pozostały oznaczone jako niepełne. Nie sprawdzono ich w terenie.
- Rzeczywiste Responses API: dokumentacja Thule Urban Glide 3 zwróciła źródła i trzy parametry. Minimalna szerokość drzwi nie została przyjęta jako pomiar szerokości sprzętu; `widthCm` pozostało puste. Próba pustego zdjęcia nie zwróciła żadnego modelu. `artifacts/equipment-live-check.json`. To kontrola integracji i odmowy zgadywania, nie benchmark identyfikacji zdjęć.
- Testy integracyjne sprawdzają migrację i konflikty zestawów, izolację kont, usuwanie metadanych zdjęć, własność zadań, błędy AI, niepełną przesiadkę, brak dalszej trasy, niedostępny silnik samochodowy oraz walidację obszaru mapy. Fikcyjne dane są wyłącznie w bazach testowych.
- Web: 10/10 PASS w końcowym wspólnym przebiegu `redesign.spec.ts` i `equipment-chat.spec.ts`. Obejmuje obsługę samą klawiaturą, pominięcie konfiguracji, zestawy, fakty miejsca, zapis planu przed Google Maps i jego przywracanie, późne odpowiedzi AI oraz rozmowę o sprzęcie. Wybrane stany sprawdzono axe. To nie jest pełny audyt czytnika ekranu.
- Android: kompilacja APK i 32/32 testy JVM PASS. Lint: 0 błędów, 36 ostrzeżeń. Zestaw testowy ma osobny identyfikator `pl.przejscie.app.validation` i korzysta z izolowanego API 3082. Przebieg urządzeń znajduje się w `tests/android/redesign_smoke.py`.
- Fizyczny Samsung SM-S948B: 7/7 kontroli PASS przy zastanym systemowym powiększeniu tekstu 115%. Pominięcie konfiguracji otwiera mapę bez zgody na lokalizację, dwa zestawy zapisują się niezależnie, Wawel pokazuje fakty przed rozpoczęciem planowania, a zestawy i zapisane miejsce przetrwały restart procesu. Raport: `artifacts/android-redesign-R5GL305JQ0E/results.json`. Nie zmieniono danych zwykłej aplikacji. Test używał XML interfejsu i ADB, więc nie zalicza się do testu TalkBack ani terenowego GPS.
- Ponowny audyt TalkBack po przebudowie pozostaje niewykonany. Emulator zgłaszał ANR Android Accessibility Suite, a po restarcie również System UI; nie udało się przejść wiarygodnego scenariusza. Dowody: `artifacts/talkback-redesign-developer.png`, `artifacts/talkback-redesign-settings.png`. Nie włączano usługi czytnika ani nie zmieniano fontu emulatora; odczyt końcowy: usługi `null`, skala `1.0`. Nie wykonano też nowego pełnego przebiegu z czytnikiem webowym. Testy klawiatury i axe tego nie zastępują.
- Pozostają do sprawdzenia w terenie: dokładność przesiadek na parkingach, faktyczny przejazd z GPS, działanie Google Maps na fizycznym urządzeniu oraz obsługa aplikacji z TalkBack. Potwierdzone obliczenia tras nie są audytem dostępności miejsc.
- Końcowy APK telefonu przebudowano z `https://miastowzasiegu.pl`. Kontrola manifestu i DEX potwierdziła pakiet `pl.przejscie.app`, właściwy adres i brak adresu testowego API. Plik: `artifacts/releases/miasto-w-zasiegu-2026-10-03/miasto-w-zasiegu-android.apk`, SHA256 `a04230c0825b6990a422efcdc2acfda4bc4c54539ce485858cc260f82031dcb4`. Dowód: `artifacts/android/public-apk-verification.json`. Starszy plik z tego katalogu miał błędny adres testowy; zachowano go wyłącznie w kopii roboczej. Rozdzielono katalogi budowania wariantu zwykłego i walidacyjnego. Gotowy APK nie został zainstalowany na istniejącej aplikacji użytkownika; test telefonu korzystał z osobnego wariantu walidacyjnego.
- Końcowa kontrola publicznego `/api/health`: HTTP 200. Lokalny podgląd 4173 nie działał; próba uruchomienia została zatrzymana przez automatyczny przegląd uprawnień (`blocked by policy`). Nie ponawiano jej inną metodą. Wynik jest dostępny przez istniejącą publiczną domenę; izolowane procesy testowe zostały zatrzymane po testach.

## Filtry mapy, 3 października 2026

- Usunięto motta z planowania i odkrywania; nad mapą jest podsumowanie wyników i skrót do filtrów. Filtry są dostępne w każdej zakładce i na telefonie.
- `npm run build`: PASS. `npm test`: 71 PASS, 2 pominięte integracje live ORS, 0 błędów. Dziewięć nowych testów obejmuje walidację parametrów, filtrowanie przed limitem, brak danych, sprzeczne deklaracje, warunki dostępu i ławki.
- Wybrane testy Playwright (`map-filters`, `exploring`, `workflow`, `freshness`, `place-facts`): 18/18 PASS. Obejmują rzeczywiste trasy ORS, zachowanie podróży po zmianie widoku, aktywność obserwacji, pięć nowych scenariuszy filtrów, klawiaturę i mobilny widok 320/390 px.
- Po końcowym dopracowaniu przywracania widoczności obserwacji i układu stopki wykonano ponowny build oraz 5/5 testów `map-filters`, także ze zwiększonym rozmiarem tekstu. Wszystkie PASS.
- Ponowny import tego samego lokalnego PBF zachował 27 647 obiektów i zmienił wyłącznie 16 pól `access.toilet` z `unknown` na `limited` oraz datę importu. Porównanie: `artifacts/places-filter-fix-diff.json`.
- Lokalne API 3081 zrestartowane przez istniejący skrypt psst. Potwierdzono `database=ready`, `routing=ready`, 105 toalet spełniających filtr dostępności i 45 po dodaniu bezpłatności. W odpowiedzi nie ma jawnych statusów `no`/`limited`.
- Zrzuty: `artifacts/map-filters-mobile.png`, `artifacts/map-filters-toilets-desktop.png`. Desktop pokazuje rzeczywiste wyniki bez fixture. Mobilny dialog ma rzeczywisty katalog, a test używa lokalnego zastępczego stylu mapy, aby sprawdzenie klawiatury nie zależało od zewnętrznych kafelków.
- Miejskie źródła sprawdzono, lecz ich rekordów nie scalono automatycznie z OSM. Zakres i przyczyna: [MAP-FILTERS.md](MAP-FILTERS.md).

## Web i API

- Pierwsza integracja miasta: 3298 przystanków ZTP plus 27 647 miejsc OSM. Główne API 3081 po restarcie zwraca 30 945 miejsc, gotową bazę i routing. Import jest ręczny, bez zainstalowanego harmonogramu. Karty pokazują wyposażenie, źródło, datę zmiany i pobrania; brak terenowego potwierdzenia pozostaje jawny. [Zakres importu](MUNICIPAL-STOPS.md).
- `npm run build`: PASS. TypeScript i produkcyjny build Vite. MapLibre pozostaje największym osobno ładowanym modułem. Service worker zawiera 32 własne pliki, bez API, danych kont i zewnętrznych kafelków.
- `RUN_ORS_TESTS=1 npm test`: **90/90 PASS, bez pominięć**. Testy używają izolowanych baz, nie dopisują kont ani barier do zwykłej bazy. Zestaw obejmuje też ulubione miejsca, dobre odkrycia, rozróżnianie adresów i źródeł, przestrzenny wybór barier, wspólny limit czasu obliczeń, dobór miejsc odpoczynku, filtry, godziny oraz import danych ZTP i zachowanie po awarii.
- Rzeczywisty ORS: trasa 306 m, objazd syntetycznej przeszkody 482,2 m, po rozwiązaniu ponownie 306 m. Osobny test kolejności przystanków: 306,1 m. Błędy silnika nie tworzą pozornego wyniku. Filtr utwardzenia zachowuje odpowiednią semantykę ORS 10.0.1; szczegóły i limity w [ROUTING.md](ROUTING.md).
- Lokalny import: 139 045 rekordów w prostokącie Krakowa i okolicy, w tym 120 515 adresów i 18 530 segmentów ulic. Wyszukiwanie zachowuje polskie znaki i numer domu. Ulice i miejsca bez adresu pozostają przybliżone; adres obiektu nie oznacza potwierdzonego dostępnego wejścia.
- Bezpośrednio sprawdzona trasa Długa 12 → Rynek Główny 1: 668,4 m i 7 instrukcji. Pola początku i celu startują puste. Do pięciu przystanków, zmiana kolejności, usuwanie i zamiana kierunku. Edycja wybranego adresu unieważnia współrzędne.
- Konta: scrypt, cookie i Bearer, trwałość po ponownym otwarciu bazy, wersjonowanie profilu, własność zgłoszeń, limity logowania i ochrona żądań z innego origin. Test zmiany cookie na drugie konto przy identycznej wersji profilu odrzuca nieaktualny zapis, trasę, wylogowanie i usunięcie historii. Web ignoruje odpowiedzi rozpoczęte przed zmianą sesji.
- Personalizacja czasu: izolacja kont i profili, minimum trzech odpowiednich przejazdów, odrzucanie wartości odstających i duplikatów, usuwanie historii. Zmienia czas, nie geometrię ani ostrzeżenia. Testowe przejazdy są syntetyczne i pozostają w izolowanej bazie.

## Przeglądarka i gra

Niezależny audyt UX po dwóch rundach poprawek: **partial**, bez deklaracji pełnej zgodności WCAG. Pozostała nieaktualna nazwa regionu na ekranie konta. Uwaga o braku gry na telefonie została zawężona po sprawdzeniu działającej ścieżki Wspólnie → Iskry Miasta. Zakres, raporty i ograniczenia opisano w [UX-AUDIT-2026-10-03.md](UX-AUDIT-2026-10-03.md).

Po niżej opisanym pełnym przebiegu dodano powiązanie wskazówki hasła z polem rejestracji przez `aria-describedby`. Build i ponowne **6/6 testów workflow PASS** (`artifacts/ux-account-report.json`). Osobno sprawdzono klawiaturę, treść powiązanej instrukcji i przełączenie na logowanie. Całych 59 testów nie powtarzano po tej zmianie semantycznej.

Najnowszy pełny przebieg po poprawkach audytu UX, `2026-10-03T11-03-26-097Z-3e114185`: **59/59 PASS, 0 pominiętych i 0 niestabilnych**, wszystkie 16 plików. Build TypeScript/Vite PASS. Pięć nowych testów sprawdza stabilny fokus i pojedynczy komunikat wyniku, brak podwójnych żądań, błąd z ponowieniem, odrzucenie spóźnionej trasy oraz przeliczanie/edycję zapisanego planu. Istniejące testy prywatności, profilu i miejskich danych przeszły w tym samym przebiegu. [Plan i zakres audytu](UX-AUDIT-2026-10-03.md). Raport: `artifacts/e2e-runs/2026-10-03T11-03-26-097Z-3e114185/html/index.html`.

Pełny przebieg `npm run test:e2e` w Chromium, `2026-10-03T10-29-06-335Z-58821b28`: **51/53 PASS, 2 błędy**. Oba dotyczyły etykiety przycisku preferencji po wcześniejszej zmianie nagłówka: wizualnie zawierał szerokość, lecz nazwa dla czytnika ją pomijała. Poprawiono nazwę tak, aby obejmowała widoczną szerokość i cel przycisku, a testy zachowały sprawdzanie aktywnego pomiaru. Po poprawce **16/16 PASS** w zestawie profil + miejskie dane + filtry + czytelność + fakty o miejscu (`artifacts/municipal-final-report.json`). Obejmuje oba wcześniejsze błędy i wszystkie 6 scenariuszy profilu, w tym wyścigi odpowiedzi.

Po dalszym sprawdzeniu poprawiono widoczność awarii pierwszego importu oraz zachowanie źródła w konwersji karta → zapisane miejsce → cel → zapisany plan. Zestaw miejski + ulubione + odpoczynek przeszedł **12/12 PASS** (`artifacts/municipal-recovery-report.json`), w tym 3 miejskie scenariusze. Finalny build TypeScript/Vite PASS. Nie przedstawiamy poprzedniego pełnego przebiegu jako 53/53 ani sumy powtórzeń jako liczby unikalnych testów.

Każdy plik pełnego przebiegu miał nowe API3082 i preview4174. Zachowano rzeczywiste limity kont i izolowane bazy. Asystent sieciowy zwracał kontrolowany błąd konfiguracji, bez płatnych wywołań. Wcześniejszy pełny przebieg przed filtrami i ZTP: 46/46 PASS, `2026-10-03T10-06-58-493Z-b1a7d6e5`.

1. Strona opisowa, pauza animacji i przejście do planowania.
2. Pominięcie konfiguracji, prawdziwe adresy i przystanek, rzeczywista trasa, zapis i odtworzenie planu z przystankiem bez internetu.
3. Edycja adresu blokuje obliczanie do wyboru podpowiedzi; zmiana kolejności i usuwanie przystanków.
4. Dwie niezależne przeglądarki: rejestracja, zapis potrzeb, logowanie, pobranie, zmiana na drugim urządzeniu, ponowne pobranie, czyszczenie profilu po wylogowaniu.
5. Mobile 390 × 844: adresy, brak poziomego przewijania, brak OSM w panelu treści, zgłoszenie, zachowanie opisu po powrocie z mapy, zapis, odświeżenie i rozwiązanie.
6. Awaria trasy i niedostępna dokumentacja dają czytelne komunikaty; szerokość pozostaje nieuzupełniona.
7. Gra: zagadki, iskry, odblokowanie ozdoby i trwałość treningu bez wysyłania obserwacji. Trzy scenariusze albumu sprawdzają zapis pocztówek, potwierdzenia i rozdzielenie właścicieli.
8. Gra mobile: klawiatura, ograniczony ruch, trening bez konta i oddzielny tryb miasta.
9. Gra z kontem: zapis obserwacji na izolowanym API, nagroda, zakup ozdoby i ponowny odczyt ogrodu.
10. Ulubione: sześć scenariuszy zapisu, szybkiego wyboru, usuwania, synchronizacji, zmian konta i błędów bez utraty danych.
11. Eksplorowanie miejsc zachowuje zaplanowaną podróż; błędna odpowiedź serwera pozwala ponowić obliczenie. Stary zapis zachowuje datę pierwotnych obliczeń.
12. Pięć scenariuszy prywatności planu oraz osobny test jego blokowania: zmiana konta, opóźnione odpowiedzi sesji, brak internetu, starszy format i jawny zapis urządzenia. Prywatny plan nie pojawia się przejściowo obcej osobie.
13. Większy tekst, kontrast i ograniczony ruch pozostają po odświeżeniu. Stare zgłoszenie znika z aktywnej mapy także bez przeładowania strony.
14. Szkice profilu, zapis lokalny i kontowy, opóźnione odpowiedzi oraz Enter w wyszukiwaniu wózka; nowy szkic nie jest tracony po zakończeniu starszego zapisu.
15. Rzeczywisty odpoczynek przy trasie, podgląd bez zmiany celu, dodanie przystanku, ograniczenia i wygasanie; wydruk bez ujawniania zablokowanego prywatnego planu.
16. Filtry mapy, osobne warstwy, klawiatura i mobile; miejskie fakty z pochodzeniem, brak danych kontra zero, daty źródła kontra pobranie i brak zapewnienia dostępności. Rzeczywisty Teatr Słowackiego 03 zachowuje źródło przez zapis miejsca, ponowne otwarcie, obliczenie ORS i zapis planu.
17. Awaria odświeżenia zachowuje starszy zapis z ostrzeżeniem. Pierwsza awaria bez miejskich rekordów jest widoczna na liście; ponowne sprawdzenie potwierdza odzyskanie dostępu bez kasowania zapytania użytkownika.

Raport pełnego przebiegu: `artifacts/e2e-runs/2026-10-03T10-29-06-335Z-58821b28/html/index.html`; statusy procesów: `runner-summary.json` w tym samym katalogu. Raporty po poprawkach: `artifacts/municipal-final-report/index.html` i `artifacts/municipal-recovery-report/index.html`.

Axe nie zgłosił naruszeń w badanych ekranach landing, planowania, profilu, gry i karty miejskiego przystanku. To kontrola wybranych stanów, nie pełny audyt WCAG. Gra ma pauzę i respektuje ograniczenie ruchu. Sprawdzono wizualnie desktop, mobile i ilustracje SVG. Rzeczywisty odczyt nowej karty także w osobnej przeglądarce na głównym API: `artifacts/municipal-live-desktop.png`, `municipal-live-source.png`. Mobilna awaria źródła jest izolowanym scenariuszem testowym: `municipal-source-outage-mobile.png`.

Zrzuty: `artifacts/v2-route-desktop.png`, `v2-route-mobile.png`, `v2-game-desktop.png`, `v2-wheelchair-documentation.png`, `game-*.png`. Szczegóły gry: [GAME.md](GAME.md). Manifest i ikony gry działają przez HTTP; fizyczna instalacja PWA jest niesprawdzona. Prawdziwości obserwacji terenowej nie potwierdza walidacja formularza.

## Dokumentacja wózków

- 13 modeli początkowych ma przyjazne nazwy i opisy po polsku. Oryginały pozostają w danych API. Redakcja nie zmieniła statusów porównania ani wartości.
- Rzeczywiste wyszukiwanie przez OpenAI Responses z web search wykonano dla WHILL Model C2: dokumenty producenta, cztery parametry, źródła i cytaty. Zakres 55,4–65 cm pozostał zakresem; `widthCm:null`, bez podstawienia przypadkowej liczby.
- Dowody: `artifacts/wheelchair-discovery-live.json`, `wheelchair-discovery-api.json`. Wynik sprawdzono również w interfejsie przeglądarki.
- Po restarcie API ponowiono zapytanie: `cached:true`, ten sam identyfikator, bez kolejnego wywołania asystenta. Wyniki pozostają w SQLite, zadania przerwane restartem dostają czytelny błąd.
- Testy odrzucają nieudokumentowane parametry, lokalne URL, szerokość siedziska używaną jako całkowita i cytowania nieodwiedzonych dokumentów. To nie zastępuje oceny treści ani pomiaru egzemplarza.
- Klucz przekazano z psst do procesu API, bez zapisania w aplikacji lub kodzie. Główny skrypt startowy korzysta z psst, jeśli jest dostępny. Do wyszukiwania trafia nazwa modelu, bez profilu i przejazdów.

## Android i Wear OS

- Podstawowy scenariusz rzeczywistym TalkBack 16 na emulatorze Android 36: potrzeby, wybór adresów, przewijanie formularza, obliczenie 703,6 m trasy, odczyt ostrzeżenia i manewru oraz zakończenie sesji. Gesty przechodziły przez czytnik; treść sprawdzono przez jego funkcję Display speech output. Wpisywanie tekstu było wspomagane przez ADB. To nie jest test klawiatury ekranowej, odsłuch akustyczny ani pełny audyt WCAG. Dowód pierwszego sprawdzenia: `android/evidence/talkback-summary.json`.
- Po naprawie ponowiono rzeczywisty TalkBack: fokus zostaje na wybranym adresie i przycisku obliczenia, wynik jest ogłaszany, błąd ponowienia nie pozostawia starej trasy ani prowadzenia. Powrót sieci umożliwia ponowienie bez wpisywania adresów. Finalny raport: `android/evidence/talkback-focus-summary.json`. Przywrócono ustawienia czytnika, sieć i czysty ekran główny emulatora; brak działającej usługi GPS.
- Aktualny APK debug telefonu zbudowany. **32 testy JVM PASS**, lint telefonu: 0 błędów, 24 ostrzeżenia. Release i Wear OS nie były ponownie kompilowane w ostatniej poprawce fokusu. SHA256 aktualnego telefonu: `a47e726b8442162ca0456fb101c62fb038bd5b2e5a52ca1ca07cf8aefe3d580a`, potwierdzony odczytem pliku; metadane: `android/evidence/build-results.json`.
- Historyczny przebieg wcześniejszego APK: **20 kontroli emulatora PASS** dla opcjonalnego głosu TTS (15 prowadzenia, 5 wylogowania). Polska synteza działała również bez sieci po pobraniu pakietu głosu. Zapisano callbacki i niepusty sygnał PCM, bez testu fizycznego głośnika lub Bluetooth. Głos jest domyślnie wyłączony w nowej sesji. Dowód: `android/evidence/tts-summary.json`. Tych 20 kontroli nie powtarzano po poprawce fokusu.
- Wcześniejszy audyt wygody: **24 kontrole emulatora PASS** (7 odtwarzania widoku i Wstecz, 3 odmowy lokalizacji, 2 sieci, 4 małego ekranu/większego tekstu, 8 izolacji szkicu). To osobny wcześniejszy przebieg, nie 24 powtórzone kontrole aktualnego APK z TTS.
- Rzeczywista trasa z UI: Długa 12 → Długa 4 → Floriańska 44 → Floriańska 20 → Floriańska 1, 760,5 m. To wyliczenie na emulatorze, nie fizyczny przejazd.
- Finalny APK używa 3081. Testy kont używały osobnego 3083 i bazy w pamięci; serwer zatrzymano. Emulator wyczyszczony z testowego konta, odblokowany, bez usługi GPS.
- Dowody aktualnego audytu: `android/evidence/ux-summary.json`, `ux-*-results.json` i odpowiadające im zrzuty. Wcześniejsze scenariusze: `workflow-results.json`, `workflow-*.png`. Test GPS przy wygaszonym ekranie jest osobno opisany w [ANDROID.md](ANDROID.md).
- Nie potwierdzono dostarczenia instrukcji ani wibracji na sparowanym zegarku. Test Androida nie uruchamiał płatnego wyszukiwania modelu, które sprawdzono osobno przez API i web.

## Granice aktualnej wersji

Nie wykonano testów na S26 Ultra ani zegarku użytkownika, rzeczywistego przejazdu, pełnego audytu czytnikiem ekranu, długiej pracy na baterii ani utraty GPS między budynkami. Brak automatycznego przeliczania po zejściu z trasy. Web planuje i przechowuje instrukcje; Android ma próbne prowadzenie GPS.

Konta działają we wspólnym lokalnym backendzie. APK jest skonfigurowany pod emulator; telefon fizyczny wymaga dostępnego endpointu i odpowiedniej konfiguracji. Przed publikacją potrzebne są HTTPS, moderacja, odzyskiwanie konta, polityka prywatności i kopie zapasowe.

Nie wykonano połączeń telefonicznych, automatycznej analizy Street View, publikacji internetowej ani zapisów do usług miejskich. Przejście i Iskry Miasta działają lokalnie na porcie 4173.

