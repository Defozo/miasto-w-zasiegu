# Android i Wear OS

Telefon używa interfejsu React współdzielonego z webem, dołączonego do APK. Kotlin/Compose obsługuje natywną mapę prowadzenia, GPS, głos, uprawnienia i połączenie z zegarkiem. Wear OS jest opcjonalnym ekranem instrukcji z telefonu. Szczegóły: [architektura hybrydowa](ANDROID-HYBRID.md).

Logowanie odbywa się przez Clerk w przeglądarce systemowej; aplikacja nie zbiera hasła. [Konfiguracja konta, Native API i callbacka](AUTH.md). Starszy interfejs Compose jest dostępny diagnostycznie przez `-PhybridUi=false` i nie definiuje bieżącego doświadczenia użytkownika.

## Uruchomienie

Wymagania: JDK 21, Android SDK platform 37, platform-tools, emulator z API 26 lub nowszym dla telefonu. Projekt używa Gradle Wrapper 9.5.0, AGP 9.3.0, Compose BOM 2026.08.00. `compileSdk=37`, `targetSdk=36`, `minSdk=26` telefon / `30` zegarek.

```powershell
$env:JAVA_HOME = 'C:\sciezka\do\jdk-21'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\android\gradlew.bat -p android :phone:assembleDebug :wear:assembleDebug :phone:testDebugUnitTest
```

APK: `android/phone/build/outputs/apk/debug/phone-debug.apk` i `android/wear/build/outputs/apk/debug/wear-debug.apk`. Każdy instalujemy na odpowiednim urządzeniu. Oba mają ten sam applicationId `pl.przejscie.app` i domyślny podpis debug, wymagane przez Data Layer. Nie instalować obu na tym samym urządzeniu.

Domyślny adres API w emulatorze: `http://10.0.2.2:3081`. Backend musi działać na komputerze. Inny endpoint można podać jako `-PbackendUrl=https://...`. Zwykły HTTP jest dozwolony tylko dla localhost, 127.0.0.1 i 10.0.2.2. Produkcyjny endpoint wymaga HTTPS. Build nie zawiera sekretów.

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 install -r .\android\phone\build\outputs\apk\debug\phone-debug.apk
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n pl.przejscie.app/pl.przejscie.phone.MainActivity
```

## Planowanie i prowadzenie

Wspólny interfejs udostępnia mapę z listą wyników, potrzeby, zapisane miejsca, paszporty i zgłoszenia. Wybrany adres trzeba zatwierdzić z podpowiedzi; edycja tekstu usuwa poprzednie współrzędne. GPS jest opcjonalny przy wyborze punktu, a odmowa uprawnienia nie blokuje ręcznego adresu.

Po obliczeniu trasy przycisk rozpoczęcia prowadzenia przekazuje plan do natywnej usługi. Użytkownik osobno włącza prowadzenie GPS i uprawnienie do dokładnej lokalizacji. Usługa działa na pierwszym planie z powiadomieniem oraz możliwością zatrzymania. Nie uruchamia się automatycznie ponownie po zabiciu procesu.

Pozycja starsza niż 20 sekund, dokładność gorsza niż 30 m lub odległość od trasy ponad 40 m wstrzymują instrukcję. Przy zejściu z trasy aplikacja prosi o ponowne zaplanowanie; nie przelicza jej automatycznie. Mapa pokazuje całą trasę i pozwala przywrócić śledzenie pozycji po przesunięciu widoku. Tekstowe manewry są dostępne także przy błędzie podkładu.

## Głos i dostępność

Polski głos offline, jeśli jest dostępny, może uruchamiać się wraz z prowadzeniem. Przełącznik zapamiętuje wyciszenie; przy aktywnym czytniku ekranu wymagane jest ręczne włączenie głosu. Dostępne są powtórzenie bieżącej instrukcji i ustawienia mowy, bez automatycznego pobierania pakietów. Ręczny podgląd trasy nie mówi.

Stan należy do usługi, więc zmiana widoku nie powtarza samoczynnie manewru. Stary lub niedokładny GPS blokuje mowę. Zakończenie prowadzenia, zmiana konta lub znana utrata autoryzacji zatrzymuje wypowiedź. Utrata prawa do odtwarzania na rzecz innej aplikacji wycisza głos bez automatycznego wznowienia.

Współpracę z TalkBack, rzeczywiste powiększenie, odsłuch przez głośnik i Bluetooth należy sprawdzić dla bieżącego APK. Test starszych ekranów Compose nie potwierdza działania obecnego WebView.

## Wear OS

Stan wysyłany jest jako zastępowany DataItem `/guidance/current` przez `DataClient.setUrgent()`. Każda ramka ma identyfikator sesji, czas, tryb, krok, dystans i wyjaśnienie. To stan, nie kolejka poleceń. Telefon odświeża stan co 5 sekund.

Zegarek pokazuje instrukcję wyłącznie przy aktywnym połączeniu i danych nie starszych niż 30 sekund. Opóźniony starszy stan nie zastępuje nowego. Przy utracie połączenia, braku GPS lub wygaśnięciu stanu pojawia się prośba o sprawdzenie telefonu. Krótka wibracja dotyczy wyłącznie nowego kroku aktualnego prowadzenia GPS. Ręczny pokaz lokalny na zegarku ma stale widoczne `POKAZ • BEZ GPS` i nie jest rzeczywistą trasą.

Wymagane są sparowane urządzenia, działające Google Play services oraz zgodne identyfikatory i podpisy. Nie potwierdzono jeszcze komunikacji na parze telefon + Wear OS. Aplikacja nie obiecuje działania z iPhone'em ani zegarkami innymi niż Wear OS.

## Konto i dane na urządzeniu

Clerk SDK obsługuje sesję; API weryfikuje token i właściciela każdego prywatnego zapisu. Zestawy potrzeb i zapisane miejsca konta są współdzielone z webem. Dane gościa pozostają oddzielne. Konflikt wersji wymaga świadomego wczytania lub ponownego zapisania, zamiast nadpisywania zmian drugiego urządzenia.

Usługa GPS sumuje dystans i czas na telefonie. Po zakończeniu kwalifikującej się sesji użytkownik może dobrowolnie zapisać podsumowanie z oceną i osobną zgodą. Do API trafiają dystans, czas, profil i deklaracja dotarcia, bez surowego śladu GPS. Podgląd, emulator i pozycje oznaczone jako symulowane nie mogą być zapisane jako rzeczywisty przejazd. Serwer nie potwierdza niezależnie prawdziwości GPS.

## Ograniczenia i testy

Nowe trasy i dane wymagają sieci. Nie ma grafu tras offline ani terenowej gwarancji dostępności wejścia. Pełna podróż, dokładność GPS między budynkami, długi czas pracy na baterii, bieżący TalkBack i sparowana para telefon-zegarek wymagają osobnej walidacji. Sam build, emulator lub uruchomienie aplikacji na urządzeniu nie potwierdzają tych funkcji.

Izolowane testy i pakiet walidacyjny opisują [ANDROID-HYBRID.md](ANDROID-HYBRID.md), [TESTING.md](TESTING.md) oraz [tests/android/README.md](../tests/android/README.md). Opublikowane APK są wersjami demonstracyjnymi; podpis i endpoint należy sprawdzić przed własną dystrybucją.

Podstawy platformy: [Data Layer i zgodne podpisy](https://developer.android.com/training/wearables/data/overview), [DataItem](https://developer.android.com/training/wearables/data/data-items), [foreground service](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
