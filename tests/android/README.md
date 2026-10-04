# Testy Android

Domyślnym interfejsem telefonu jest teraz hybryda opisana w [ANDROID-HYBRID.md](../../docs/ANDROID-HYBRID.md). Aktualny scenariusz to `scripts/hybrid-phone-smoke.mjs`, testy mostu są w `HybridPolicyTest.kt`, a kontrakt webu w `tests/hybrid`. Poniższe starsze testy ekranów Compose wymagają `-PhybridUi=false`.

## Nowy przebieg: mapa, zestawy i podróże

`redesign_smoke.py` używa osobnego pakietu `pl.przejscie.app.validation` i API 3082 z bazą w pamięci. Nie czyści ani nie zastępuje danych zwykłej aplikacji. Można wskazać emulator lub podłączony telefon. Skrypt sprawdza znacznik izolowanego API przed jakąkolwiek zmianą.

```powershell
node scripts/e2e-api.mjs
# W drugim terminalu, z poprawnym JAVA_HOME i ANDROID_HOME:
.\android\gradlew.bat -p android :phone:assembleDebug -PhybridUi=false -PvalidationBuild=true -PbackendUrl=http://127.0.0.1:3082
adb -s emulator-5554 install -r android/phone/build-validation/outputs/apk/debug/phone-debug.apk
python tests/android/redesign_smoke.py --serial emulator-5554
```

Wyniki są w `artifacts/android-redesign-<serial>`. Odczyt XML i zrzuty ekranu sprawdzają działanie interfejsu, ale nie zastępują aktywnego TalkBack. Starsze wyniki poniżej odnoszą się do poprzedniego interfejsu.

Wariant walidacyjny ma osobny katalog `build-validation`, aby zasoby i adres API nie mieszały się ze zwykłym APK. Przed dystrybucją sprawdź identyfikator pakietu i adres `BACKEND_URL` w zbudowanym pliku, szczególnie przy równoległych pracach.

```powershell
python scripts/verify-android-apk.py android/phone/build/outputs/apk/debug/phone-debug.apk --package pl.przejscie.app --backend https://miastowzasiegu.pl
```

Skrypt sprawdza manifest i skompilowane pliki DEX, a nie tylko konfigurację projektu. Zwraca też SHA256 pakietu.

`android/phone/src/test` zawiera 46 testów JVM: 32 dotychczasowe dotyczą geometrii i prowadzenia, ważności ramki, profilu, potwierdzania adresów, limitu przystanków, filtrowania przejazdu, zapisanych miejsc, izolacji kont i głosu. Dziewięć w `HybridPolicyTest` sprawdza granicę originu WebView, dozwolone zasoby i adresy, zewnętrzny przepływ płatności oraz dane przekazywane do natywnego prowadzenia. Pięć kolejnych sprawdza świeżość i dokładność pozycji na mapie oraz domyślne uruchomienie głosu i pierwszeństwo ręcznego wyciszenia.

```powershell
.\android\gradlew.bat -p android :phone:testDebugUnitTest :phone:lintDebug :wear:lintDebug
```

`workflow_smoke.py` wykonuje rzeczywiste interakcje przez adb i odczytuje drzewo dostępności. `smoke.py` jest zgodnym aliasem tego skryptu. Wymaga emulatora, APK z adresem izolowanego API oraz działającego API z bazą testową. Skrypt dopuszcza tylko lokalne porty 3082 lub 3083 i numery seryjne `emulator-*`. **Czyści dane wyłącznie `pl.przejscie.app` na wskazanym emulatorze**. Tworzy losowe, syntetyczne konto w izolowanej bazie. Nie należy kierować testowego serwera do głównego pliku bazy.

```powershell
.\android\gradlew.bat -p android :phone:assembleDebug -PbackendUrl=http://10.0.2.2:3083
adb -s emulator-5554 install -r android/phone/build/outputs/apk/debug/phone-debug.apk
python tests/android/workflow_smoke.py --serial emulator-5554 --api http://127.0.0.1:3083
```

Po teście należy odtworzyć zwykły APK bez `-PbackendUrl`, zainstalować go i usunąć dane konta testowego z emulatora. Izolowany serwer 3083 używa bazy w pamięci; jego zatrzymanie usuwa wszystkie konta testowe.

Zapisane miejsca mają dodatkowy scenariusz uruchamiany na tym samym izolowanym API z modułem `/api/favorites`:

```powershell
python tests/android/favorites_smoke.py --serial emulator-5554 --api http://127.0.0.1:3083
```

Sprawdza lokalny Dom/Pracę i duplikaty, wybór zapisów jako początku/celu/przystanku, wymianę z drugim klientem przez API, potwierdzenie usuwania, odświeżenie, oddzielenie gościa od konta oraz dwóch kont od siebie, a także trwałość po restarcie. Syntetyczne konta powstają tylko w bazie testowej. Wykonanie 03.10.2026: **16/16 PASS**, wynik w `android/evidence/favorites-results.json`. Starszy scenariusz `workflow_smoke.py` nadal sprawdza synchronizację profilu, wielopunktową trasę i wykluczenie symulacji GPS. Helpery zamykają klawiaturę przed przewijaniem, sprawdzają fokus przed wpisywaniem i korzystają z aktualnych nazw adresów API.

13 kontroli PASS z 03.10.2026 zapisano w `android/evidence/workflow-results.json`. PNG i XML są faktycznymi zrzutami emulatora. Kontrole obejmują:

1. Izolowane API oraz emulator, bez urządzenia fizycznego.
2. Pominięcie opcjonalnego onboardingu.
3. Brak skrótów OSM/ORS/POI w podstawowym ekranie.
4. Ręczne logowanie przez natywne UI.
5. Import profilu konta do pól Androida.
6. Konflikt równoległej zmiany bez nadpisania nowszej wersji.
7. Jawne pobranie aktualnego profilu.
8. Zapis natywny widoczny przez API drugiego klienta.
9. Zaszyfrowane dane sesji na urządzeniu.
10. Blokadę planowania po zmianie tekstu wybranego adresu.
11. Trasę z rzeczywistego serwera przez trzy potwierdzone przystanki.
12. Zablokowanie wysyłania sesji emulatora jako rzeczywistego przejazdu.
13. Usunięcie sesji z urządzenia po wylogowaniu.

Symulacja GPS jest częścią testu. Przekazuje pozycje geometrii trasy emulatorowi; nie powstaje rzeczywisty przejazd ani próbka do nauki czasu. Konto jest przygotowywane przez API, natomiast login, profil, adresy i trasa są obsługiwane przez UI. To nie jest test przeglądarki. Sieciowe wyszukiwanie modelu nie jest wywoływane przez ten skrypt.

Wcześniejsze `smoke-results.json` i zrzuty bez prefiksu `workflow-` dokumentują pierwszą wersję, sprzed rozszerzenia kont i adresów. Obejmowały także pracę usługi przy zablokowanym ekranie i wygaśnięcie GPS. Nie należy sumować ich z bieżącymi kontrolami jako nowej pełnej walidacji.

Do uzupełnienia na sprzęcie: pełna sesja i zgoda na zapis rzeczywistego przejazdu, TalkBack, duży font, odmowa uprawnień, 30 minut z zablokowanym ekranem, zakłócenia GPS, Wear OS i rozłączenie pary. Build i test telefonu nie potwierdzają odbioru Data Layer, wibracji ani wyglądu na zegarku.

## Głos w emulatorze

`tts_smoke.py` wymaga uruchomionego na ekranie prowadzenia GPS, wcześniej obliczonej rzeczywistej trasy oraz zainstalowanego lokalnego polskiego głosu Androida. Nie tworzy kont ani zapisów API. Przekazuje syntetyczną pozycję z geometrii trasy, bada powtórzenia i przerwania oraz czasowo wyłącza sieć i odbiornik lokalizacji; przywraca ich ustawienia w `finally`. Kończy prowadzenie. Wyniki i zrzuty zapisuje z prefiksem `tts-`.

```powershell
python tests/android/tts_smoke.py
```

Sonda PCM i `FocusProbeActivity` istnieją tylko w wariancie debug i działają wyłącznie na emulatorze z jawnym znacznikiem `cache/tts-probe-enabled`, który tworzy skrypt. Sonda zapisuje próbkę syntezy instrukcji. Nie nagrywa mikrofonu ani wyjścia audio komputera. Aktywność testowa na 3 sekundy żąda audio focus, nie odtwarza żadnego dźwięku. Brak próbek audio w wariancie release został dodatkowo sprawdzony kompilacją jego kodu Kotlin.

`tts_logout_smoke.py` wymaga APK z `-PbackendUrl=http://10.0.2.2:3083` i pamięciowego API 3083. Tworzy syntetyczne konto, loguje się przez UI, wyznacza trasę i wylogowuje podczas trwającej instrukcji. Sprawdza zatrzymanie, brak wznowienia i brak zapisów przejazdu. Na końcu czyści lokalne dane aplikacji. Po teście zatrzymujemy API pamięciowe i instalujemy zwykły APK 3081.

Same `queued` i `onDone` nie dowodzą słyszalności przez fizyczny głośnik. Wyniki rozróżniają callbacki, niezerowe PCM i niewykonany test akustyczny na sprzęcie.

## Rzeczywisty TalkBack

Oddzielny audyt czytnika wykonano 03.10.2026 na `Przejscie_API_36` z zainstalowanym TalkBack 16.0.0.738667889. Wyniki podstawowego scenariusza i TTS są w `android/evidence/talkback-summary.json`. Późniejszy test poprawki fokusu na końcowym APK opisuje `talkback-focus-summary.json`. Nie należy doliczać tych obserwacji do wcześniejszych automatycznych kontroli UI ani uznawać zrzutu XML za test czytnika.

Powtarzanie scenariusza:

1. Zapisz początkowe ustawienia usług dostępności, eksploracji dotykiem i sieci. Używaj wyłącznie emulatora.
2. Włącz zainstalowany TalkBack. Do obserwacji wypowiedzi można tymczasowo włączyć jego „Display speech output”. Nie wymaga to pobierania APK ani logowania do Google.
3. Przejdź główny ekran gestami czytnika. W tym emulatorze użyto `adb emu event mouse` jako fizycznego wejścia dotykowego, w tym gestu następnego elementu i podwójnego dotyku w tym samym punkcie. Zwykłe `adb shell input tap` może ominąć zachowanie TalkBack. Nie uruchamiaj równolegle `uiautomator dump`, który potrafi zmienić zachowanie aktywnej usługi.
4. Wybierz z rzeczywistych podpowiedzi Długa 12, Kraków · Fornir oraz Floriańska 1, Kraków. Sprawdź pozostanie fokusu na wybranej karcie i zamknięcie klawiatury. W wykonanej próbie wpisywanie było wspomagane `adb input text`, więc obsługa klawiatury ekranowej nie jest potwierdzona.
5. Wyznacz trasę. Przycisk ma zachować fokus podczas oczekiwania i po odczytaniu wyniku. Wynik konkretnej próby wynosił 703 m; nie jest to stała oczekiwana dla przyszłych danych.
6. Wyłącz sieć emulatora i ponów gotową trasę. Sprawdź odczyt błędu, zachowanie fokusu, dostępność komunikatu następnym gestem oraz usunięcie wcześniejszego wyniku i prowadzenia. Przywróć sieć i ponów bez zmiany adresów.
7. W `finally` przywróć ustawienia sieci i dostępności, wyłącz nakładkę wypowiedzi, zakończ usługę GPS i usuń lokalny stan testowy. Pozostaw zwykły APK 3081 na ekranie głównym. Nie twórz fikcyjnych kont, przejazdów ani zgłoszeń w głównej bazie.

Sprawdzaj widoczny fokus i rzeczywiste komunikaty czytnika po każdej istotnej akcji. Przed kolejnym dotknięciem obejrzyj aktualny ekran; podwójny dotyk w innym punkcie lub w starej pozycji elementu może dać pozorny błąd fokusu. Test nie obejmuje pełnej zgodności WCAG, Braille, odsłuchu akustycznego, sprzętu fizycznego ani wyścigu odpowiedzi z przełączeniem konta. Bieżąca poprawka ma 32 przechodzące testy JVM i lint bez błędów, z 24 ostrzeżeniami. TTS oraz wcześniejszy pełny audyt UX pozostają osobnymi, historycznymi przebiegami.
