# Android i Wear OS: wspólny interfejs, natywne prowadzenie

Decyzja użytkownika z 3 października 2026: Android współdzieli ekrany webowe; GPS, głos i przekazywanie instrukcji do zegarka pozostają natywne. Wear OS zachowuje osobny interfejs przeznaczony do szybkiego odczytu na okrągłym ekranie.

## Podział

| Obszar | Implementacja |
| --- | --- |
| Mapa, wyszukiwanie, warunki miejsc, potrzeby, zapisane miejsca, zgłoszenia | Te same komponenty React co w web/PWA |
| Start aplikacji | Pliki interfejsu spakowane w APK, bez pobierania strony startowej |
| Nowe dane, wyznaczanie tras, konta | Dotychczasowe API, produkcyjnie HTTPS |
| Lokalizacja mapy, zdjęcia, aparat, wydruk planu | WebView i odpowiednie okna/uprawnienia systemu |
| Mapa podczas prowadzenia, manewry, GPS w tle, polski głos | MapLibre Native, `GuidanceService` oraz `GuidanceSpeech` |
| Logowanie | Istniejący Clerk SDK i przeglądarka systemowa |
| Zegarek | Natywne komponenty Wear Compose, bieżący manewr i stan połączenia |

Współdzielimy kod, a nie aktualizację strony w trakcie działania aplikacji. Zmiana interfejsu webowego trafia na telefon po zbudowaniu i zainstalowaniu nowego APK. Budowanie APK nie wdraża strony publicznej. Dane z API pozostają bieżące.

## Przebieg użytkownika

1. Wybór potrzeb lub pominięcie konfiguracji, wyszukanie miejsca i ocena jego warunków odbywają się w tym samym interfejsie co na webie.
2. Po obliczeniu trasy „Rozpocznij prowadzenie” przekazuje geometrię, instrukcje i wybrany profil do Androida.
3. Android pokazuje mapę całej trasy. „Włącz prowadzenie GPS” uruchamia usługę dopiero po uzyskaniu uprawnienia do dokładnej lokalizacji. Mapa śledzi pozycję, a karta u góry podaje odległość i następny manewr. Przesunięcie mapy wyłącza śledzenie kamery; mały przycisk przywraca widok pozycji. Drugi pokazuje całą trasę.
4. Mały przycisk głośnika włącza lub wycisza instrukcje i zapamiętuje wybór. Głos domyślnie włącza się przy rozpoczęciu prowadzenia, jeśli dostępny jest polski głos offline; nie włącza się automatycznie przy aktywnym czytniku ekranu. Przy braku głosu ten sam przycisk otwiera ustawienia. Pełna lista manewrów, ostrzeżenia, powtórzenie instrukcji i ograniczenia są pod „Plan i warunki”. Powrót do planu zachowuje ekran webowy i aktywną usługę.
5. Zmiana planu lub tożsamości zatrzymuje stare prowadzenie. Nieaktualny zapis offline wymaga ponownego obliczenia trasy. Niewykorzystane przygotowanie prowadzenia wygasa po pięciu minutach.
6. Zakończenie przejazdu korzysta z dotychczasowego, dobrowolnego podsumowania. GPS emulatora nie może zostać wysłany jako rzeczywisty przejazd.

Niebieski znacznik mapy pokazuje tylko pozycję nie starszą niż 20 sekund i o dokładności do 30 m. Współrzędne pozostają w pamięci natywnej usługi, bez kopiowania do WebView ani ramek zegarka. Awaria podkładu nie blokuje tekstowych instrukcji; ekran pokazuje komunikat i możliwość ponownego wczytania. Odzyskanie połączenia przywraca również geometrię i kamerę. Podkład: OpenFreeMap / OpenMapTiles / OpenStreetMap, z odnośnikami do autorów i licencji na mapie. [API MapLibre](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.maps/-map-view/index.html).

Pierwsze uruchomienie importuje wyłącznie dane lokalnego gościa z poprzedniej wersji: zapisane miejsca i zestawy potrzeb. Nie nadpisuje już istniejących danych w nowym interfejsie. Dane kont nadal pobiera serwer; nie są kopiowane do magazynu gościa. Poprzedni magazyn pozostaje dostępny dla wariantu diagnostycznego, ale kolejne zmiany między oboma interfejsami nie są synchronizowane.

## Granica web/Android

`WebViewCompat.addWebMessageListener` udostępnia mały protokół żądań z identyfikatorem i wersją. Dopuszczony jest tylko dokładny origin skonfigurowanego backendu i główny dokument. Ramki iframe nie dostają odpowiedzi z funkcji natywnych. Nie używamy `addJavascriptInterface` ani originu `*`.

Dokumenty aplikacji i jej zasoby są odczytywane z APK pod originem backendu; `/api` nadal trafia do serwera. Zewnętrzne strony otwierają się poza uprzywilejowanym WebView. Adresy `javascript:`, `file:` i arbitralne intenty Androida są blokowane. Błędy TLS nie są pomijane. HTTP dopuszczamy tylko dla lokalnych adresów deweloperskich. Debugowanie WebView jest włączone wyłącznie w oddzielnym pakiecie walidacyjnym.

SDK otrzymuje i odnawia token dla konkretnej tożsamości; web prosi o niego do bieżącego żądania. Token nie trafia do `localStorage`. Zmiana tożsamości odtwarza prywatne widoki. Dane przekazywane do prowadzenia mają limity rozmiaru, sprawdzone współrzędne, indeksy kroków i parametry potrzeb.

Dokumentacja platformy: [komunikacja WebView z API natywnym](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge), [Compose dla Wear OS](https://developer.android.com/training/wearables/compose).

## Budowanie

Wymagania Androida pozostają opisane w [ANDROID.md](ANDROID.md). Zależności Node powinny być zainstalowane przez `npm ci`.

```powershell
./android/gradlew.bat -p android :phone:assembleDebug :wear:assembleDebug -PbackendUrl=https://miastowzasiegu.pl
```

Gradle sprawdza TypeScript, buduje Vite do `android/web-bundle` i pakuje te pliki do APK. Nie używa ani nie zmienia publicznego `dist`. `npm run build:android` pozwala oddzielnie zbudować ten sam interfejs.

Testy izolowane:

```powershell
node scripts/e2e-api.mjs
./android/gradlew.bat -p android :phone:assembleDebug :wear:assembleDebug :phone:testDebugUnitTest :phone:lintDebug :wear:lintDebug -PvalidationBuild=true -PbackendUrl=http://127.0.0.1:3082
```

Telefon i zegarek mają w tym wariancie wspólny, oddzielny identyfikator `pl.przejscie.app.validation`. Oba APK trzeba instalować na różnych urządzeniach. Pamięciowe API 3082 nie zapisuje fikcyjnych danych do zwykłej bazy. `scripts/hybrid-phone-smoke.mjs` używa wyłącznie tego pakietu na emulatorze.

Po uruchomieniu API i instalacji walidacyjnego APK telefonu na `emulator-5554`:

```powershell
node scripts/hybrid-phone-smoke.mjs
```

Scenariusz czyści tylko dane osobnego pakietu testowego. Sprawdza adresy i trasę z API, przekazanie planu do Androida, widoczną linię trasy i znacznik GPS na zrzucie, sterowanie kamerą, wyciszenie, odmowę lokalizacji, syntetyczny GPS, wygaszenie ekranu, powrót do mapy i zakończenie prowadzenia. Wymaga działającego lokalnego ORS i Google Play services emulatora.

Testy kontraktu webowego wymagają podglądu Vite skierowanego do izolowanego API. W drugim terminalu uruchom testy:

```powershell
$env:API_TARGET = 'http://127.0.0.1:3082'
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 45783 --outDir ../android/web-bundle
# Drugi terminal:
npx playwright test --config playwright.hybrid.config.ts
```

`tests/android/hybrid_watch_smoke.py` wykonuje osobny przebieg na okrągłym emulatorze Wear OS `emulator-5580` z walidacyjnym APK zegarka. Pokaz i kontrolowana ramka testowa pozostają lokalne. Skrypt przywraca rozmiar tekstu i usuwa dane osobnego pakietu po próbie.

## Wyniki z 3 października 2026

- TypeScript, budowanie webu oraz oba APK: poprawnie.
- JVM: **46/46** testów. Dziewięć sprawdza granicę web/Android; pięć kolejnych ważność pozycji na mapie oraz uruchamianie i wyciszanie głosu.
- Lint końcowych plików: **0 błędów**, 44 ostrzeżenia telefonu i 4 zegarka. Osobny wariant walidacyjny telefonu zgłosił 46 ostrzeżeń. Ostrzeżenia nie są traktowane jako zaliczony audyt dostępności.
- Przeglądarka: **4/4** scenariusze, obejmujące wspólny interfejs, kontrakt mostu i widoczny błąd szerokości zestawu z przeniesieniem fokusu oraz poprawieniem wartości. Most logowania jest w tych testach atrapą; nie jest to rzeczywiste OAuth.
- Telefon z rzeczywistym WebView na emulatorze: **17/17** kontroli. Wyszukiwanie i trasa ORS, błąd szerokości, mapa z geometrią i znacznikiem GPS, cała trasa i śledzenie pozycji, przesuwanie kamery, mały przełącznik głosu, odmowa uprawnienia, utrata i odzyskanie GPS, wygaszenie i wybudzenie ekranu, powrót do tego samego planu, zatrzymanie usługi, blokada wysłania symulowanego przejazdu i brak wyjątków JavaScript.
- Okrągły Wear OS 192 dp: **6/6** kontroli. Oczekiwanie, oznaczony pokaz, zmiana manewru, wyjście z pokazu, ukrycie zapisanej instrukcji bez połączenia i tekst powiększony do 130%.
- W APK sprawdzono pakiet `pl.przejscie.app`, backend telefonu `https://miastowzasiegu.pl`, zgodne podpisy i identyczne pliki interfejsu webowego w testowanym i docelowym wariancie.

Końcowy przebieg telefonu obejmuje nową mapę, głos i obsługę powrotu z zablokowanego ekranu. W trakcie próby wykryto ANR w oczekiwaniu `SurfaceView.onWindowResize`; mapa używa teraz `TextureView` z limitem 30 klatek/s. Powtórzony pełny przebieg zakończył się bez tego błędu. Nie zastępuje to próby wydajności i baterii na fizycznym urządzeniu. Reguła otwierania płatności dopuszcza wyłącznie HTTPS do `checkout.stripe.com` i `billing.stripe.com`; transakcji nie wykonywano.

Wcześniejszy niezależny audyt webu wskazał niewidoczny błąd szerokości zestawu. Komunikat przeniesiono pod pole, z fokusem i przewinięciem; poprawienie wartości oraz zapis sprawdzono w przeglądarce i rzeczywistym WebView. Ten cykl został przerwany poleceniem przebudowy nawigacji; jego zapis pozostaje w `artifacts/hybrid/ux-audit/interrupted.json`.

Po zakończeniu przebudowy nawigacji wykonano dwa nowe, niezależne audyty wspólnego interfejsu, każdy bez historii i pamięci. Oba objęły `/app`, `/gra`, `/sign-in`, `/sign-up` i `/cennik` i nie potwierdziły usterek wymagających poprawy. Między audytami ponowiono cztery testy przeglądarkowe: **4/4**. Nie wdrażano dodatkowych zmian interfejsu. Wszystkie 76 plików podglądu pozostało identycznych przed i po audytach oraz zgodnych z dostarczonym APK, mimo równoległych zmian źródeł w repozytorium.

Ocena niezależnych audytów jest **częściowa**: obejmuje próbki interakcji webowych, a nie natywną mapę i Wear OS. Nie sprawdzono czytnika ekranu, rzeczywistego powiększenia 200%, pełnego planowania trasy, rzeczywistego logowania ani płatności. Izolowane API udostępniało dla kont tylko stan niedostępności. Raporty i zakres: [`podsumowanie audytu`](../artifacts/hybrid/ux-audit/navigation/final-review.json), [`pierwszy raport`](../artifacts/hybrid/ux-audit/navigation/report-1.json), [`drugi raport`](../artifacts/hybrid/ux-audit/navigation/report-2.json). Wynik nie stanowi potwierdzenia pełnej zgodności z WCAG.

Dowody: [`verification.json`](../artifacts/hybrid/verification.json), [`telefon`](../artifacts/hybrid/phone/results.json), [`zegarek`](../artifacts/hybrid/wear/results.json), [`przeglądarka`](../artifacts/hybrid/browser-results.json). Zrzuty pokazują [natywny manewr telefonu](../artifacts/hybrid/phone/gps.png) i [oznaczony pokaz zegarka](../artifacts/hybrid/wear/demo-right.png), a nie sparowaną sesję.

Wersje testowe do instalacji są w `artifacts/releases/miasto-hybrid-2026-10-03`. Każdy APK należy zainstalować na odpowiednim urządzeniu; mają ten sam identyfikator pakietu. Są podpisane kluczem debug. Publiczna strona nie była wdrażana w ramach tej zmiany.

## Ograniczenia

Interfejs uruchamia się z APK, lecz mapy podkładowe, wyszukiwanie i nowe trasy nadal wymagają internetu. Pozostają dotychczasowe ograniczenia silnika prowadzenia: brak automatycznego przeliczenia po zejściu z trasy i brak terenowej gwarancji dostępności.

Zegarek odrzuca instrukcje starsze niż 30 sekund i ukrywa manewr po utracie połączenia. Lokalny pokaz jest stale oznaczony jako przykład bez GPS. Osobne uruchomienie obu emulatorów nie potwierdza sparowania ani rzeczywistej transmisji Data Layer.

Wyniki tej iteracji i ich ograniczenia są zapisywane w `artifacts/hybrid`. Wcześniejsze audyty TalkBack dotyczą poprzedniego interfejsu; nowy WebView wymaga osobnego testu czytnika i próby na fizycznym telefonie oraz zegarku.

W tej iteracji nie wykonano rzeczywistego logowania OAuth, odsłuchu instrukcji, pełnego audytu TalkBack, sparowania telefonu z zegarkiem ani terenowego przejścia trasy. Nie sprawdzano na urządzeniu aparatu, wyboru pliku i drukowania. Krótka próba z wygaszonym ekranem potwierdza ciągłość usługi w tym przebiegu, nie wielogodzinną pracę w trybach oszczędzania baterii.
