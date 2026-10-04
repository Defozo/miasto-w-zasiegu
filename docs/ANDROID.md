# Miasto w zasięgu: Android i Wear OS

Telefon domyślnie używa interfejsu React współdzielonego z webem, dołączonego do APK. Kotlin/Compose obsługuje prowadzenie GPS, głos, uprawnienia i połączenie z zegarkiem. Wear OS pozostaje natywnym, opcjonalnym ekranem instrukcji z telefonu. Szczegóły aktualnej architektury i testów: [ANDROID-HYBRID.md](ANDROID-HYBRID.md).

Poniższe wcześniejsze audyty opisują także poprzednie ekrany Compose, dostępne diagnostycznie przez `-PhybridUi=false`. Nie stanowią automatycznie walidacji interfejsu hybrydowego.

Logowanie i rejestracja używają teraz Clerk przez przeglądarkę systemową. Konfiguracja Native API, callback i wspólnego backendu: [AUTH.md](AUTH.md). Historyczne testy formularza hasła poniżej nie są potwierdzeniem działania OAuth.

## Uruchomienie

Wymagania: JDK 21, Android SDK platform 37, platform-tools, emulator z API 26 lub nowszym dla telefonu. Projekt używa Gradle Wrapper 9.5.0, AGP 9.3.0, Compose BOM 2026.08.00. `compileSdk=37`, `targetSdk=36`, `minSdk=26` telefon / `30` zegarek.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\android\gradlew.bat -p android :phone:assembleDebug :wear:assembleDebug :phone:testDebugUnitTest
```

APK: `android/phone/build/outputs/apk/debug/phone-debug.apk` i `android/wear/build/outputs/apk/debug/wear-debug.apk`. Każdy instalujemy na odpowiednim urządzeniu. Oba mają ten sam applicationId `pl.przejscie.app` i domyślny podpis debug, wymagane przez Data Layer. Nie instalować obu na tym samym urządzeniu.

Domyślny adres API w emulatorze: `http://10.0.2.2:3081`. Backend musi działać na komputerze. Inny endpoint można podać jako `-PbackendUrl=https://...`. Zwykły HTTP jest dozwolony tylko dla localhost, 127.0.0.1 i 10.0.2.2. Produkcyjny endpoint wymaga HTTPS. Build nie zawiera sekretów.

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 install -r .\android\phone\build\outputs\apk\debug\phone-debug.apk
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n pl.przejscie.app/pl.przejscie.phone.MainActivity
```

## Funkcje

- Polskie, natywne ekrany planowania, profilu i prowadzenia. Duże przyciski, systemowe skalowanie fontu, nagłówki i komunikaty dla usług dostępności. Brak własnych animacji i automatycznego przewijania.
- Rzeczywiste adresy, ulice i miejsca z `/api/locations`. Osobne pola skąd/dokąd i do 5 przystanków pośrednich. Każde pole wymaga wybrania podpowiedzi. Zmiana tekstu usuwa wcześniejsze współrzędne i blokuje obliczanie do ponownego wyboru. Wyszukiwanie wymaga sieci; źródła są w rozwijanych szczegółach.
- Zapisane miejsca przy każdym polu trasy. Potwierdzony punkt można nazwać „Dom”, „Praca” lub dowolną własną nazwą, a potem wybrać jako start, cel lub przystanek. Dla gościa lista jest przechowywana tylko na telefonie; konto używa wspólnego `/api/favorites`. Logowanie nie wysyła automatycznie lokalnych adresów. Po wylogowaniu wraca osobna lista gościa. Lista konta jest pobierana przy otwarciu i ma przycisk odświeżenia; nie jest przechowywana w lokalnej liście. Usuwanie wymaga potwierdzenia. Do 30 miejsc; ponowny zapis tej samej nazwy i współrzędnych nie tworzy kopii. Punkt zachowuje rzeczywisty adres oraz informację o przybliżonym położeniu, niezależnie od nadanej nazwy.
- Opcjonalny onboarding „Ustaw potrzeby / Pomiń”. Profil: rodzaj przemieszczania się, opcjonalna **zmierzona całkowita szerokość**, limit nachylenia, wysokość krawężnika, unikanie nieutwardzonej nawierzchni. Wartości 6% i 2 cm są jawnie opisanymi ustawieniami początkowymi. Brak szerokości oznacza pominięcie filtra, nie szerokość zero.
- Wyszukiwanie modelu w katalogu `/api/wheelchairs?q=` i na jawne żądanie `/api/wheelchairs/search`. Sieciowe wyszukiwanie wysyła tylko nazwę modelu, odpytuje zadanie co 2 s do 3 minut i pokazuje źródła w szczegółach. Wymiar nie jest automatycznie wpisywany do pola pomiaru. Wariant i pomiar musi sprawdzić użytkownik.
- Trasa z `/api/route` i prawdziwymi instrukcjami ORS. Ostrzeżenia oraz błędy API są widoczne. Nie ma lokalnej trasy zastępczej ani ukrytego mocka.
- Start i cel są początkowo puste. Lokalizacja jest pobierana tylko na żądanie, z limitem 20 sekund na świeży fix. Odmowa nie blokuje ręcznego wyboru adresu. Współrzędne adresu nie są gwarancją lokalizacji dostępnego wejścia.
- Ręczny podgląd kroków trasy jest oznaczony i nie śledzi GPS.
- Próbne prowadzenie GPS: foreground service `location` uruchamiane z widocznej aplikacji po zgodzie użytkownika; komunikat w systemie i przycisk zatrzymania. Usługa nie jest automatycznie restartowana po zabiciu procesu.
- Prosta projekcja GPS na bieżący/następny odcinek trasy. Pozycja starsza niż 20 sekund, dokładność gorsza niż 30 m lub odległość od trasy ponad 40 m wstrzymują instrukcję. Przy zejściu z trasy aplikacja prosi o ponowne zaplanowanie. To nie jest pełny silnik nawigacji.

## Instrukcje głosowe

Głos po polsku działa podczas prowadzenia GPS, także przy zablokowanym ekranie. W interfejsie hybrydowym uruchamia się wraz z prowadzeniem, jeśli dostępny jest głos offline i użytkownik go nie wyciszył. Mały przycisk głośnika zapamiętuje wyciszenie. Przy aktywnym czytniku ekranu głos wymaga ręcznego włączenia. Starszy, diagnostyczny interfejs Compose nadal zaczyna sesję bez głosu. Dostępne są powtórzenie bieżącej instrukcji i ustawienia mowy, bez automatycznego pobierania pakietów. Ręczny podgląd trasy nie mówi.

Stan należy do usługi prowadzenia, więc przerysowanie ekranu i powrót z tła nie powtarzają instrukcji. Automatyczne wypowiedzi są rozróżniane według sesji, manewru i dotarcia w pobliże celu; zmiana samego dystansu nie uruchamia nowej wypowiedzi. Ręczne powtórzenie korzysta z aktualnego dystansu. Przy zbliżeniu do celu głos przypomina o sprawdzeniu właściwego wejścia.

Niedokładny, stary albo leżący poza trasą GPS wstrzymuje mowę i blokuje powtórzenie. Po powrocie pozycji aplikacja informuje, że bieżącą instrukcję można powtórzyć. Utrata prawa do odtwarzania dźwięku na rzecz innej aplikacji wycisza głos bez automatycznego wznowienia. Zakończenie prowadzenia, znana aplikacji utrata autoryzacji i zmiana konta zatrzymują wypowiedź oraz zwalniają syntezator. Samo wygaśnięcie tokenu po stronie serwera zostaje poznane dopiero przy kolejnym żądaniu konta.

Test postoju wykrył, że wcześniejszy filtr minimalnego ruchu 2 m zatrzymywał dostarczanie świeżych pozycji stojącej osobie. Aktywna usługa nadal prosi o pozycję co 2 sekundy, ale przyjmuje także nieruchome fixy. Wyłączenie odbiornika lub rzeczywisty brak świeżych danych nadal wstrzymuje prowadzenie.

Na emulatorze API 36 najpierw sprawdzono komunikat o braku polskiego głosu, potem jawnie pobrano w ustawieniach standardowy pakiet około 22 MB. Dowody `tts-initial.png`, `tts-before-download.png`, `tts-download-status.png` i `tts-ready-off.png` dokumentują te etapy. Scenariusz `tests/android/tts_smoke.py` sprawdza włączenie, powtórzenie przy wyłączonym Wi-Fi i transmisji danych, brak powtórek po aktualizacjach GPS i powrocie z tła, następny manewr, utratę audio focus, wyciszenie, utratę i powrót GPS, zablokowany ekran oraz zatrzymanie usługi. Osobny `tts_logout_smoke.py` używa wyłącznie pamięciowego API 3083 i sprawdza przerwanie wypowiedzi przez wylogowanie.

`tts-events.log` rozróżnia przyjęcie do kolejki, `onStart`, `onDone` i przerwanie. `tts-synthesis.wav` to niezerowe PCM z callbacku syntezatora dla syntetycznej instrukcji testowej, a nie nagranie mikrofonu czy głośnika. Potwierdzono dane audio i zakończenie odtwarzania zgłoszone przez silnik; nie potwierdzono akustycznego odsłuchu fizycznego telefonu ani słuchawek Bluetooth. Współpracę z TalkBack sprawdzono później w ograniczonym zakresie opisanym poniżej. Próba dodatkowej transkrypcji lokalnym Whisper nie uruchomiła się z powodu błędu biblioteki DLL; nie jest traktowana jako weryfikacja wymowy.

Zapis PCM i pomocnicza aktywność odbierająca audio focus są dostępne wyłącznie w `src/debug`, tylko na emulatorze i po jawnym utworzeniu znacznika `cache/tts-probe-enabled` przez testerów. Wariant `release` ma pustą implementację sondy i nie zawiera aktywności testowej. Zwykłe użycie aplikacji nie zapisuje dźwięku. Nie zmieniono ani nie testowano głosu na Wear OS.

Weryfikacja tej funkcji 3 października 2026: **32/32 testy JVM**, **15/15 kontroli głosu** na końcowym APK z API 3081 oraz **5/5 kontroli wylogowania** na osobnym API 3083. Lint telefonu: **0 błędów, 24 ostrzeżenia**. Kompilacja kodu Kotlin i scalanie manifestu wariantu release przeszły; sprawdzono brak aktywności testowej i operacji plikowych sondy w tym wariancie. Pełne wyniki: `android/evidence/tts-summary.json`, `tts-results.json`, `tts-logout-results.json` i `tts-release-isolation.json`. Starsze scenariusze poniżej dokumentują wcześniejsze iteracje i nie są doliczane do tych 20 kontroli.

Podstawy platformy: [TextToSpeech i asynchroniczna kolejka](https://developer.android.com/reference/android/speech/tts/TextToSpeech), [callbacki odtwarzania](https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener), [audio focus](https://developer.android.com/media/optimize/audio-focus).

## TalkBack i zachowanie fokusu

3 października 2026 uruchomiono rzeczywisty, fabrycznie dostępny TalkBack 16.0.0.738667889 na emulatorze API 36. Eksploracja dotykiem, gest następnego elementu i podwójne dotknięcie przeprowadziły scenariusz: profil potrzeb, wybór rzeczywistych adresów, wynik i ostrzeżenie trasy, manewr z syntetycznego GPS oraz zakończenie sesji. Treść odczytu obserwowano przez opcję czytnika „Display speech output”. Teksty i liczby wpisywano pomocniczo przez adb. To nie jest test pisania klawiaturą ekranową ani akustyczny odsłuch głośnika. Osiem obserwacji i ograniczenia są w `android/evidence/talkback-summary.json`.

W tej próbie TalkBack przerwał głos prowadzenia: log zarejestrował `onStart`, `focus_lost` i `onStop`. Po świadomym ponownym włączeniu głosu silnik zgłosił `onDone`. Nie dowodzi to jeszcze wygody równoczesnego korzystania z obu głosów. Ocena przez użytkownika czytnika pozostaje potrzebna.

Audyt ujawnił przeskakiwanie fokusu po wyborze adresu i pojawieniu się trasy. Poprawka zachowuje kartę wybranej podpowiedzi jako ten sam element. Klawiatura zamyka się po wyborze, a fokus zostaje na karcie. Przycisk wyznaczania pozostaje w drzewie dostępności podczas obliczania i uprzejmie ogłasza wynik. Nie ma opóźnionych żądań fokusu z odpowiedzi API. Ponowne obliczenie usuwa poprzedni wynik, żeby błąd nie pozostawił starej trasy gotowej do prowadzenia. Komunikat błędu jest bezpośrednio za przyciskiem.

Na końcowym APK z API 3081 powtórzono rzeczywisty test TalkBack: podpowiedzi nie odebrały fokusu wpisywanemu polu, wybór obu adresów zachował fokus na kartach, a wynik 703 m został odczytany bez powrotu do wcześniejszego pola. Wyłączenie sieci emulatora i ponowienie gotowej trasy dało odczytany błąd, zachowany fokus przycisku i brak starego wyniku. Kolejny gest odczytał błąd. Po odzyskaniu sieci ponowienie zwróciło trasę. Dowody: `talkback-focus-summary.json`, `talkback-focus-verified-origin.png`, `talkback-focus-verified-end.png`, `talkback-focus-verified-success.png` i `talkback-focus-final-recalculate-error-focus.png` w `android/evidence/`.

Po zmianie ponownie przeszły build debug, **32/32 JVM** i lint telefonu (**0 błędów, 24 ostrzeżenia**). Wcześniejszych 20 kontroli TTS i 24 kontroli UX nie powtarzano na tym APK; ich wyniki są historyczne. Nie powtarzano kompilacji release ani Wear OS. Nie testowano wyścigu odpowiedzi z przełączeniem konta w tej iteracji. Przywrócono ustawienia dostępności i sieci, wyłączono nakładkę mowy, usunięto dane testowe aplikacji i pozostawiono odblokowany ekran główny bez działającej usługi GPS. Test nie tworzył kont ani zapisów w głównej bazie. Nie jest to potwierdzenie pełnej zgodności WCAG 2.2 AA.

## Wear OS

Stan wysyłany jest jako zastępowany DataItem `/guidance/current` przez `DataClient.setUrgent()`. Każda ramka ma identyfikator sesji, czas, tryb, krok, dystans i wyjaśnienie. To stan, nie kolejka poleceń. Telefon odświeża stan co 5 sekund.

Zegarek pokazuje instrukcję wyłącznie przy aktywnym połączeniu i danych nie starszych niż 30 sekund. Opóźniony starszy stan nie zastępuje nowego. Przy utracie połączenia, braku GPS lub wygaśnięciu stanu pojawia się prośba o sprawdzenie telefonu. Krótka wibracja dotyczy wyłącznie nowego kroku aktualnego prowadzenia GPS. Ręczny pokaz lokalny na zegarku ma stale widoczne `POKAZ • BEZ GPS` i nie jest rzeczywistą trasą.

Wymagane są sparowane urządzenia, działające Google Play services oraz zgodne identyfikatory i podpisy. Nie potwierdzono jeszcze komunikacji na parze telefon + Wear OS. Aplikacja nie obiecuje działania z iPhone'em ani zegarkami innymi niż Wear OS.

## Konto, synchronizacja i podsumowanie przejazdu

Konto jest wspólne z aplikacją webową. Rejestracja/logowanie odbywają się jawnie w zakładce Konto. Android używa Bearer, przeglądarka cookie, a obie aplikacje tego samego konta i profilu. Hasła nie są zapisywane na urządzeniu. Token sesji jest zaszyfrowany AES-GCM kluczem w Android Keystore i wyłączony z backupu wraz z pozostałymi danymi aplikacji.

Po zalogowaniu pobierany jest profil konta. Użytkownik może osobno zapisać profil tylko na telefonie, zapisać na koncie albo pobrać aktualną wersję z konta. Zapis wysyła `expectedVersion`; konflikt nie nadpisuje ustawień drugiego urządzenia. Ponowne pobranie wymaga potwierdzenia zastąpienia lokalnych zmian. Pola konta są zgodne z web: `mobility`, `widthCm`, `maxIncline`, `maxKerbCm` jako tekst oraz `avoidUnpaved` jako boolean. W żądaniu trasy liczby są konwertowane, pusta szerokość jest pomijana. Zalogowany użytkownik przekazuje token także podczas wyznaczania trasy, aby serwer mógł zastosować indywidualny czas.

Usługa GPS lokalnie sumuje odległość między świeżymi, dokładnymi fixami i mierzy rzeczywisty czas monotoniczny. Odrzuca długie przerwy, niedokładne punkty i skoki ponad 6 m/s. Zakończenie przez użytkownika otwiera podsumowanie. Zapis `/api/trips` wymaga konta, samodzielnego wyboru oceny i osobno zaznaczonej zgody. Wysyłane są dystans, czas, profil użyty w sesji, deklaracja dotarcia do celu, ocena i opcjonalny routeId. Nie ma wysyłania geometrii ani surowego śladu. Przycisk „Nie zapisuj” usuwa lokalne podsumowanie.

Podgląd ręczny nigdy nie tworzy rzeczywistego przejazdu. Emulator oraz każda sesja z `Location.isMock` są blokowane przed wysyłką jako rzeczywisty przejazd. Zbyt mało danych o ruchu także uniemożliwia zapis. Nie wykonano fizycznego przejazdu w terenie; obsługa prawdziwego opt-in na sprzęcie pozostaje do sprawdzenia.

## Zakres i ograniczenia

Nie ma natywnego podkładu mapowego, automatycznego przeliczania, offline graph, map matchingu, aparatu/zgłoszeń z aplikacji Android, rezerwacji pomocy ani telefonu AI. Przejście całej trasy w terenie, pomiar zużycia baterii i test TalkBack na fizycznym urządzeniu pozostają do wykonania. Podstawowy test czytnika na emulatorze opisano poniżej. Żadna trasa nie jest certyfikatem przejezdności. Dostępne wejście może różnić się od współrzędnych punktu OSM.

32 testy jednostkowe obejmują projekcję na odcinek, przejście do następnego kroku, wykrycie odjazdu od trasy, ograniczenie skoku po krokach, zerowej długości odcinek, ważność ramki, walidację profilu i potwierdzonych adresów, odrzucanie symulacji i skoków GPS oraz zapisane miejsca: duplikaty, limit, aliasy, nazwy Unicode i zachowanie wybranego adresu. Dodatkowo sprawdzają odtwarzanie szkicu formularza, odrzucenie nieprawidłowych współrzędnych, kolejność przystanków i izolację właściciela szkicu. Sześć testów polityki mowy obejmuje domyślne wyłączenie, deduplikację, powtórzenie, wyciszenie, świeżość, sesje i dotarcie w pobliże celu. Dowody emulatora i szczegółowe wyniki: `android/evidence/` oraz `tests/android/`.

## Powrót do aplikacji i trudniejsze warunki

Audyt 3 października 2026 odtworzył utratę początku, celu i przystanków po usunięciu aktywności przez Androida w tle. Zwykły powrót z ekranu głównego zachowywał formularz. Szkic korzysta teraz z zapisywanego stanu aktywności: zachowuje wybrane punkty, źródła, uwagi, kolejność przystanków, niezatwierdzony tekst i niezapisane potrzeby. Tekst bez wybranej podpowiedzi nadal nie pozwala obliczyć trasy. Nie zapisujemy do tego stanu geometrii trasy, hasła, tokenu ani historii lokalizacji. Po odtworzeniu aktywności obliczoną wcześniej trasę należy ponownie wyznaczyć; aktywna usługa prowadzenia ma osobny mechanizm stanu.

Szkic adresów ma właściciela. Logowanie na inne konto i wylogowanie czyszczą start, cel oraz przystanki. Stan zapisany dla konta A nie może zostać odtworzony dla konta B ani dla gościa. Szkice nie są synchronizowane z kontem i nie stanowią historii podróży. Zapisane miejsca nadal korzystają z osobnego mechanizmu opisanego wyżej. Lokalny profil potrzeb zachowuje wcześniejsze, jawnie opisane zachowanie przy wylogowaniu.

Wstecz z zakładki Profil, Konto lub W drogę wraca do Trasy. Wstecz z Trasy pozostaje działaniem systemowym. Wyszukiwarka adresów po błędzie sieci udostępnia przycisk „Spróbuj ponownie”; odzyskanie wyników nie wymaga zmiany tekstu. Komunikat o braku wyników pojawia się dopiero po rzeczywistej odpowiedzi. Dolna etykieta „W drogę” zastępuje „Prowadź”, które na ekranie 320 dp z dużym tekstem dzieliło się w środku słowa.

Powtarzalny scenariusz `tests/android/ux_audit.py` bada powrót z tła, wymuszone odtworzenie aktywności, odmowę GPS, wyłączenie sieci emulatora i ekran 320 dp z czcionką 150%. Nie tworzy kont ani przejazdów. `tests/android/draft_privacy_smoke.py` sprawdza dwa konta wyłącznie na izolowanym API 3083 z bazą w pamięci; wymaga osobnego APK z tym adresem. Każdy scenariusz przed rozpoczęciem usuwa lokalny stan testowej aplikacji na emulatorze, a zmieniane ustawienia systemowe przywraca w bloku `finally`. Wyniki i zrzuty mają prefiks `ux-`.

Weryfikacja audytu przed dodaniem głosu: **26/26 JVM PASS**, lint telefonu **0 błędów, 22 ostrzeżenia** oraz **24/24 kontroli UI PASS**. Te kontrole to 7 przypadków lifecycle, 3 po odmowie GPS, 2 dla utraty i odzyskania sieci, 4 dla małego ekranu z dużym tekstem i 8 dla izolacji dwóch kont. Pierwsze 16 wykonano na finalnym APK z API 3081, test kont na osobnej bazie w pamięci 3083. To nowe scenariusze tej iteracji; wcześniejsze 16 testów ulubionych opisane niżej nie są doliczane do wyniku 24.

Odmowa GPS nie uruchomiła usługi i pozwoliła wybrać adres ręcznie. Po powrocie sieci przycisk ponowienia pobrał rzeczywiste podpowiedzi bez ponownego wpisywania. Odtworzone punkty posłużyły do wyznaczenia rzeczywistej trasy. W próbie dwóch kont własny szkic A i B przeżył odtworzenie aktywności, ale sekwencja A → wylogowanie → gość → B → A nie przeniosła adresów. Pamięciowe API zatrzymano po teście.

Obejrzane zrzuty: `ux-baseline-back.png` i `ux-baseline-recreated.png` dokumentują wcześniejsze usterki; `ux-lifecycle-back.png`, `ux-lifecycle-recreated.png`, `ux-api-unavailable.png`, `ux-api-retry-restored.png`, `ux-gps-denied.png`, `ux-small-large-font-top.png` oraz `ux-draft-account-b-cleared.png` dokumentują zachowanie po poprawkach. Mały ekran to zmiana rozdzielczości i gęstości tego samego AVD, nie odrębny fizyczny telefon o małej wydajności. Nie testowano TalkBack, terenowego GPS ani zegarka w tej iteracji.

## Zapisane miejsca i audyt kolejnej wersji

Kontrakt zapisanych miejsc opisuje `docs/FAVORITES.md`. Android przekazuje `expectedUserId` przy zapisie i usuwaniu z konta, a odpowiedzi z poprzedniej sesji odrzuca. Błąd pobierania konta nie przełącza potajemnie na listę gościa. Wpisy lokalne podlegają wyłączeniu backupu tak jak pozostałe dane aplikacji.

Audyt emulatora wykazał rozbieżną początkową preferencję nawierzchni: Android zaznaczał unikanie nieutwardzonych odcinków, web zaczynał bez tego filtra. W nowej instalacji obie aplikacje zaczynają z `avoidUnpaved=false`; wcześniej zapisane ustawienie użytkownika pozostaje zachowane. Stan przed poprawką jest w `android/evidence/favorites-audit-profile-before.xml`. Okna zapisanych miejsc zamykają też fokus wcześniejszego pola i klawiaturę, aby jej powrót po zamknięciu okna nie zakłócał wyboru kolejnego adresu.

Dedykowany scenariusz `tests/android/favorites_smoke.py` używa wyłącznie izolowanego API 3083 i emulatora. Sprawdza zapis gościa, brak automatycznego importu na konto, start/cel/przystanek z listy, dwa konta, synchronizację przez rzeczywiste API, anulowanie i potwierdzenie usuwania, odświeżenie i trwałość po restarcie aplikacji. Wyniki wykonania zapisuje do `android/evidence/favorites-results.json`; zrzuty mają prefiks `favorites-`. Test nie używa fizycznego telefonu.

3 października 2026 cały scenariusz zakończył się wynikiem **16/16 PASS**, a zestaw JVM wynikiem **20/20 PASS**. Lint telefonu przeszedł bez błędów. Obejrzano rzeczywiste zrzuty listy gościa i konta. Zmiany nie obejmują Wear OS, którego nie przebudowywano ani nie uznawano za sprawdzony na podstawie telefonu. Po tym przebiegu dodano także obsługę opcjonalnego `disambiguationHint`: API może krótko wyjaśnić różnicę między kilkoma punktami tego samego adresu pod ich nazwą. Wybór zawsze zachowuje dokładne `label` zwrócone przez API. Osobny odczyt na głównym API 3081 potwierdził widoczność opisów dla dwóch punktów Długa 12 (Fornir i punkt adresowy); zrzut `favorites-address-disambiguation.png`. Ten odczyt nie tworzył kont ani zapisów. Po ostatnim uzupełnieniu ponownie przeszły build, 20 testów JVM i lint telefonu.

## Walidacja rozszerzonego workflow 3 października 2026

- 14 testów JVM PASS, lint telefonu i Wear OS PASS. Oba APK zbudowane. Końcowy APK telefonu używa domyślnego API `10.0.2.2:3081`.
- 13 kontroli integracyjnych PASS na emulatorze `Przejscie_API_36`, Pixel 7 / API 36, z izolowanym serwerem 3083 i bazą w pamięci. Rejestracja konta przygotowana przez API, logowanie wykonane przez natywne UI. Wymianę profilu z drugim klientem sprawdzono przez API; ten test sam nie potwierdza obsługi przeglądarki.
- Potwierdzono import profilu, blokadę zapisu po równoległej zmianie na koncie, jawne pobranie nowszej wersji, zapis Android widoczny przez API, szyfrowanie sesji i jej usunięcie przy wylogowaniu.
- Rzeczywista trasa z UI: Długa 12 → Długa 4 → Floriańska 44 → Floriańska 20 → Floriańska 1, 760,5 m. Zmiana tekstu wybranego adresu blokuje obliczanie. To test trzech przystanków, nie fizyczny przejazd.
- Symulowane pozycje emulatora uruchomiły usługę i końcowe podsumowanie. Aplikacja zablokowała zapis symulacji, historia testowego konta pozostała pusta. Nie testowano wysłania rzeczywistego przejazdu z fizycznego telefonu.
- Ekran wyszukiwania modelu i protokół oczekiwania na wynik są przygotowane. Test Android nie wywoływał płatnego wyszukiwania w sieci; izolowany serwer nie miał klucza AI.
- Wyniki: `android/evidence/workflow-results.json`. Zrzuty `workflow-home.png`, `workflow-profile-sync.png`, `workflow-route.png` i `workflow-trip-simulation.png` przedstawiają rzeczywisty emulator.
- Konto i dane aplikacji zostały usunięte z emulatora po testach. Konta testowe powstały wyłącznie w izolowanej bazie w pamięci, nigdy w głównej bazie.

## Pierwsza walidacja 3 października 2026 (przed rozszerzeniem adresów i kont)

- Oba debug APK zostały zbudowane. 8 testów JVM przeszło, w tym wygaszenie starej ramki i odrzucenie daty daleko w przyszłości.
- Emulator `Przejscie_API_36`, Pixel 7 / API 36: 10 sprawdzeń skryptu `tests/android/smoke.py --gps` przeszło. Pobranie faktycznych miejsc, wybór celu, profil z pomiarem 68,5 cm, trasa ORS 534,4 m, ręczny podgląd i następny krok, trwały zapis profilu.
- Usługa przetworzyła **symulowany** GPS. Przy wyłączonym ekranie nadal była foreground i aktualizowała instrukcję. Po wyłączeniu lokalizacji i wygaśnięciu fixu pokazała stan wstrzymania, a przycisk zakończenia wyczyścił stan aktywnej trasy.
- To krótki test emulatora, nie pomiar długotrwałej pracy w terenie ani optymalizacji baterii Samsung.
- Sprawdzono przygotowanie stanu wysyłanego z telefonu. Nie sprawdzono dostarczenia Data Layer, wibracji ani wyglądu na fizycznym zegarku. Brak obrazu/emulatora Wear OS w zastanym SDK.

Istniejący AVD `PhotoAssistant_API_36` uruchamiał inną aplikację w lock-task mode, dlatego utworzono oddzielny AVD z już zainstalowanego obrazu. Nie usuwano wcześniejszego AVD i nie używano fizycznego telefonu.

Oficjalne podstawy: [Data Layer i wymagane zgodne podpisy](https://developer.android.com/training/wearables/data/overview), [synchronizacja DataItem](https://developer.android.com/training/wearables/data/data-items), [ograniczenia startu foreground service](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
