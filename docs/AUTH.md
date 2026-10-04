# Logowanie przez Clerk

Web i Android używają tej samej aplikacji Clerk. Web otwiera gotowe komponenty `SignIn` i `SignUp` w języku polskim na `/sign-in` i `/sign-up`. Android używa `Clerk.auth.startHostedAuth()`: logowanie odbywa się w przeglądarce systemowej, a SDK obsługuje powrót do aplikacji. Metody OAuth widoczne na tych ekranach wynikają z konfiguracji aplikacji Clerk.

## Konfiguracja

Instancja developerska skonfigurowana 3 października 2026: **Miasto w zasięgu**, osobna demonstracyjna aplikacja i instancja Clerk. Włączone są Google OAuth i alternatywne logowanie kodem e-mail; hasła są wyłączone. Native API jest aktywne, a Android `pl.przejscie.app` jest zarejestrowany. Klucze są w lokalnym `psst`, poza repozytorium. To instancja developerska, nie konfiguracja produkcyjna.

1. Dla nowej instalacji utwórz aplikację Clerk dla Miasta w zasięgu. W Social connections włącz Google dla rejestracji i logowania, wyłącz hasła i pozostaw kod e-mail jako alternatywę. Ustawienia są w `config/clerk-development.json`; można je zastosować przez `clerk config patch --app <applicationId> --instance dev --file config/clerk-development.json`. W produkcji skonfiguruj własny klient OAuth i adres przekierowania pokazany przez Clerk.
2. W `psst` zapisz dwa klucze tej samej instancji. Poniższe komendy pytają o wartość interaktywnie, bez umieszczania jej w historii poleceń:

   ```powershell
   psst --global set PRZEJSCIE_CLERK_PUBLISHABLE_KEY
   psst --global set PRZEJSCIE_CLERK_SECRET_KEY
   ```

3. Uruchom API przez `scripts/start-api-with-psst.ps1` albo cały tryb developerski z selektywnym wstrzyknięciem:

   ```powershell
   psst --global PRZEJSCIE_CLERK_PUBLISHABLE_KEY PRZEJSCIE_CLERK_SECRET_KEY -- npm run dev
   ```

   Serwer akceptuje też standardowe nazwy `CLERK_PUBLISHABLE_KEY` i `CLERK_SECRET_KEY` w środowisku. Zmienne z prefiksem `PRZEJSCIE_` mają pierwszeństwo. Frontend i Android pobierają tylko publiczny klucz z `GET /api/auth/config`; kompilacja nie wymaga kluczy i nie zawiera sekretu. Po dodaniu kluczy potrzebny jest ponowny start API.

4. Domyślne dozwolone strony to `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173` i `http://127.0.0.1:4173`. Przy wdrożeniu ustaw `CLERK_AUTHORIZED_PARTIES` na rozdzieloną przecinkami listę dokładnych originów HTTPS. Bez ścieżek, ukośnika na końcu i wildcardów. Frontend powinien kierować `/api` do tego samego serwera przez reverse proxy. `CLERK_JWT_KEY` jest opcjonalnym publicznym kluczem PEM do weryfikacji bez pobierania JWKS.
5. Dla Androida w Clerk włącz Native API i dodaj aplikację: namespace Digital Asset Links `android_app`, package name `pl.przejscie.app` (zapis w `config/clerk-android.json`). Namespace Kotlina `pl.przejscie.phone` jest inną wartością i nie trafia do tego pola Clerk. SDK rejestruje callback `clerk://pl.przejscie.app.callback`. Ustaw backend dostępny z telefonu przez istniejące `-PbackendUrl=...`; w publicznym wdrożeniu użyj HTTPS. Nie trzeba osadzać klucza w APK. Ta integracja używa logowania w przeglądarce, bez passkeys i bez odcisków certyfikatu aplikacji.

Samo `configured: true` oznacza obecność kluczy, a nie poprawne wykonanie OAuth. W konfiguracji odczytanej z Clerk potwierdzono włączone Google, wyłączone hasła i aktywne Native API. Użytkownik potwierdził skuteczne logowanie przez Google w web, a odczyt SQLite potwierdził synchronizację konta przez backend. Logowanie na telefonie wymaga oddzielnej weryfikacji.

## Sesje i dane

- Aplikacja nie przyjmuje ani nie zapisuje haseł. Dawne `POST /api/auth/register` i `/api/auth/login` zwracają `410 USE_CLERK`. Stare ciasteczka sesyjne nie logują użytkownika.
- Klienci pobierają świeży token z SDK przy każdym żądaniu wymagającym konta. Web wysyła `Authorization: Bearer`, a serwer używa `@clerk/backend.authenticateRequest()` do weryfikacji podpisu, czasu ważności i typu sesji. Sprawdza dozwoloną stronę w podpisanym `azp`; natywne tokeny mogą nie mieć tego pola. Nie ufa identyfikatorowi użytkownika przesłanemu w JSON.
- Android zachowuje w obiekcie `Account.token` wyłącznie znacznik tożsamości `clerk:user_...`, dla zgodności z istniejącymi wywołaniami. `Api.request()` wymienia go na aktualny JWT przez SDK i odrzuca żądanie, jeśli konto się zmieniło. Stary lokalny magazyn sesji jest czyszczony.
- `GET /api/auth/me` zachowuje kontrakt `{user, profile, profileVersion}`. Profil, ulubione, zgłoszenia i postępy nadal są w SQLite. Synchroniczny `getUser(req)` działa po middleware Clerk, więc istniejące moduły nie potrzebują osobnych integracji.
- Identyfikatorem nowego konta jest `clerk:<userId>`. SQLite przechowuje identyfikator Clerk, nazwę i wyłącznie potwierdzony główny e-mail. W starej kolumnie `email` nowy rekord ma techniczny identyfikator; zwracany e-mail jest w `clerk_email`. Odświeżanie nazwy i e-maila jest ograniczone do raz na 5 minut. Profil potrzeb nigdy nie jest kopiowany do Clerk.
- Dawne konta i ich dane pozostają w bazie. Nie łączymy ich automatycznie po adresie e-mail, ponieważ stary system go nie potwierdzał. Nowe konto OAuth zaczyna z osobnym identyfikatorem. Ewentualny import starych danych wymaga osobnej, świadomej migracji.
- Wylogowanie unieważnia bieżącą sesję w Clerk oraz od razu blokuje jej JWT w API do czasu wygaśnięcia. Pozostałe urządzenia zachowują sesje. Wylogowanie wykonane poza aplikacją może zostać zauważone dopiero przy odnowieniu krótkotrwałego JWT. Nie używamy webhooków ani sprawdzania każdej sesji przez zdalne API.
- Brak konfiguracji lub awaria logowania nie blokuje trybu gościa. Niepoprawny token daje błąd, nigdy anonimowy zapis w zastępstwie konta. Mapy i potrzeby lokalne pozostają dostępne. Weryfikacja przez Clerk nie jest audytem dostępności miejsca.

## Testy i ograniczenia

`node --test tests/backend/clerk-auth.test.mjs` sprawdza prawdziwą weryfikację JWT przez SDK z lokalnym kluczem RSA: podpis, wygaśnięcie, przyszły `nbf`, dozwolone strony, sesje natywne, izolację kont, profil, wylogowanie, niepotwierdzony e-mail i awarie dostawcy. Wywołania danych użytkownika i unieważnienia sesji mają lokalne atrapy. Test nie tworzy użytkowników w Clerk.

`tests/helpers/local-auth.mjs` zachowuje stary mechanizm wyłącznie jako jawnie wstrzykiwany fixture do istniejących testów domenowych i E2E. Normalny serwer nie importuje tego pliku i nie ma przełącznika środowiskowego włączającego lokalne hasła. Test synchronizacji profilu przygotowuje tożsamości w odizolowanym API; nie udaje testu OAuth.

`npx playwright test --config tests/auth-ui/playwright.config.ts` sprawdza tryb bez konfiguracji, nawigację klawiaturą, AXE panelu konta, pobieranie aktualnego tokenu i błąd wylogowania. Używa własnego API z bazą w pamięci i nie tworzy danych w zwykłej bazie ani w Clerk.

`node scripts/verify-clerk-ui.mjs [adres-aplikacji]` to jawny test rzeczywistej instancji: mobilne formularze, brak pola hasła, AXE i przekierowanie do Google. Nie wpisuje danych logowania i nie tworzy kont. Domyślnie używa `http://127.0.0.1:5173`; zrzuty zapisuje w `artifacts/auth-clerk-*.png`.

Wykonane 3 października: 9/9 testów backendu Clerk, 5/5 testów interfejsu z izolowanym API, test synchronizacji profilu i wylogowania w dwóch przeglądarkach oraz test prawdziwych formularzy Clerk na szerokości 390 px. Formularz logowania ma 0 naruszeń AXE; jest dostępne przekierowanie do Google. Pełne logowanie web potwierdził użytkownik. Kompilacja web oraz Android `assembleDebug` i testy jednostkowe zakończyły się powodzeniem. Nie sprawdzono jeszcze czytnika ekranu ani rzeczywistego OAuth na telefonie. Osobny istniejący test adresów w `accounts.test.mjs` oczekuje 3 wyników „Rynek Główny 1”, a obecny katalog zwraca 6; nie jest to test uwierzytelniania.

Przed publicznym uruchomieniem rozszerz rzeczywisty scenariusz Google o odświeżenie strony, profil na drugim urządzeniu, OAuth w Androidzie i wylogowanie z realnej sesji. Potrzebna jest też ręczna ocena czytnikiem ekranu. Zrzuty, AXE i kompilacja nie potwierdzają tych punktów. Dawne raporty testów haseł opisują historyczny interfejs, nie aktualny Clerk.

## Dokumentacja dostawcy

- [React Quickstart](https://clerk.com/docs/react/getting-started/quickstart)
- [Weryfikacja sesji](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Android Quickstart i logowanie w przeglądarce](https://clerk.com/docs/android/getting-started/quickstart)

Clerk jest zewnętrznym operatorem tożsamości. Utrzymanie i koszty zależą od planu i liczby użytkowników; nie zostały oszacowane ani wykupione w tej zmianie. Dane domenowe pozostają przenośne w SQLite, a wymiana dostawcy wymaga migracji identyfikatorów kont. Polityka prywatności wdrożenia musi uwzględniać Clerk i wybranych dostawców OAuth.
