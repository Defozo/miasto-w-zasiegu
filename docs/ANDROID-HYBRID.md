# Android i Wear OS: wspólny interfejs, natywne prowadzenie

Android współdzieli ekrany webowe; GPS, głos i przekazywanie instrukcji do zegarka pozostają natywne. Wear OS zachowuje osobny interfejs przeznaczony do szybkiego odczytu na okrągłym ekranie.

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

## Ograniczenia

Interfejs uruchamia się z APK, ale podkład mapy, wyszukiwanie i nowe trasy wymagają internetu. Nie ma automatycznego przeliczania po zejściu z trasy ani gwarancji dostępności terenowej.

Zegarek odrzuca instrukcje starsze niż 30 sekund i ukrywa manewr po utracie połączenia. Lokalny pokaz jest stale oznaczony jako przykład bez GPS. Osobne uruchomienie emulatorów nie potwierdza sparowania ani rzeczywistej transmisji Data Layer.

Pełny przebieg z czytnikiem ekranu, OAuth, aparatem, wydrukiem i sparowanym zegarkiem wymaga osobnej kontroli na docelowych urządzeniach. Krótka próba emulatora nie potwierdza wielogodzinnego działania, zużycia baterii, odbioru wibracji ani akustycznego odsłuchu. [Zasady testowania](TESTING.md).
