# Testowanie aplikacji

Repozytorium zawiera testy automatyczne webu, API, importerów i aplikacji Android. Poniższe polecenia opisują ich uruchomienie, a nie wynik bieżącego przebiegu. Raporty generowane przez testy pozostają w katalogach roboczych i nie są częścią źródłowej dystrybucji.

## Web i API

```powershell
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Testy korzystają z danych przygotowanych według README. Testy przeglądarkowe uruchamiają oddzielne API na 3082 z bazą w pamięci i preview na 4174. Każdy plik scenariuszy otrzymuje świeże procesy i bazę, zachowując normalne limity kont. Polecenie zapisuje zbiorczy raport HTML i statusy procesów w `artifacts/e2e-runs`. Nie uruchamiaj go przeciwko zwykłej bazie użytkowników.

Opcjonalne testy rzeczywistych silników tras wymagają gotowych grafów i ORS:

```powershell
$env:RUN_ORS_TESTS='1'
npm test
```

Bez tej zmiennej część testów ORS jest pomijana. Nie interpretuj takiego przebiegu jako sprawdzenia routingu. Wybrane zestawy można uruchamiać osobno, np.:

```powershell
node --test tests/backend/billing.test.mjs
node --test tests/backend/municipal-stops.test.mjs
node --test tests/backend/favorites.test.mjs
```

Testy Stripe i logowania z atrapami potwierdzają logikę aplikacji, nie rzeczywistą płatność ani pełny OAuth. Przeglądarkowe testy Street View również mają kontrolowaną ramkę. Zewnętrzne integracje wymagają osobnej próby z poprawną konfiguracją i kontem testowym, bez fikcyjnych wpisów w publicznej bazie.

## Android i Wear OS

Budowanie i izolowany wariant `pl.przejscie.app.validation` opisują [ANDROID.md](ANDROID.md) i [ANDROID-HYBRID.md](ANDROID-HYBRID.md). Scenariusze i warunki uruchomienia znajdują się również w [tests/android/README.md](../tests/android/README.md).

Syntetyczne pozycje emulatora nie potwierdzają rzeczywistego prowadzenia. Dwa osobno działające emulatory nie potwierdzają przesyłania instrukcji do sparowanego zegarka. Odsłuch, baterię, GPS między budynkami i współpracę z TalkBack trzeba oceniać na docelowych urządzeniach.

## Dostępność i pełny przebieg

Cel rozwoju to WCAG 2.2 AA. Testy klawiatury, małych ekranów i AXE są częścią kontroli, lecz pełna zgodność nie została potwierdzona. Potrzebny jest przebieg z czytnikiem ekranu, rzeczywistym powiększeniem 200%, większym tekstem, błędami sieci i zmienionymi danymi. Scenariusz powinien obejmować potrzeby, znalezienie miejsca, ocenę faktów i braków, trasę oraz zapis lub zgłoszenie korekty.

Każdy wynik należy wiązać z wersją aplikacji, urządzeniem, konfiguracją i datą. Test danych nie potwierdza dostępności terenowej, a test interfejsu nie potwierdza aktualności pomiarów.
