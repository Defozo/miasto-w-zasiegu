# Płatności i reklamy Miasta w zasięgu

Uzgodniony cennik: Premium 10 zł/miesiąc, reklama jednego obiektu na mapie
49 zł/miesiąc, mapa i sponsorowane wyniki 99 zł/miesiąc. Jednorazowe wsparcie
5–1000 zł nie odnawia się i nie nadaje Premium. Wszystkie kwoty są w PLN.
Strona `/cennik` jest również dostępna pod `/pricing`.

## Plan Stripe i stan integracji

Prototyp integruje Stripe w trybie testowym. Nowa instalacja wymaga własnego konta, katalogu cen, konfiguracji portalu i webhooka.

Przyjęty wariant to hostowany Checkout, Billing dla abonamentów, jednorazowy
Checkout dla wsparcia oraz Customer Portal. Plan zaleca też Smart Retries
i ustawienia odzyskiwania nieudanych płatności w panelu Stripe. Nie zostały
one jeszcze skonfigurowane na koncie.

OAuth MCP nie jest kluczem uruchomieniowym aplikacji. Bez klucza API i sekretu
webhooka strona pokazuje ceny i informację „Płatności wkrótce”, a serwer
odrzuca zakup.

## Zweryfikowana konfiguracja 3 października 2026

Klucze dostarczone w psst wskazują tryb testowy konta „Miasto w zasięgu”
(`<identyfikator własnego środowiska>`). To inne środowisko niż osobny sandbox połączony
z MCP (`<identyfikator własnego środowiska>`). Katalog, webhook, portal i aplikacja korzystają
konsekwentnie z konta wskazanego przez klucze. Nie należy mieszać obiektów
ani sekretów tych środowisk.

Utworzono cztery produkty, trzy ceny miesięczne 10/49/99 PLN, webhook
z 11 rodzajami zdarzeń i wersją API `2026-09-30.endive` oraz portal klienta
z historią faktur, aktualizacją metody płatności i anulowaniem na koniec okresu.
Sekret webhooka i identyfikator konfiguracji portalu są w psst.

Aplikacja na izolowanej bazie w pamięci utworzyła rzeczywiste testowe Checkout
dla wszystkich czterech ofert oraz sesję portalu. Ponowienie żądania użyło
tej samej sesji; nieukończone Checkout nie nadało Premium. Sesje wygaszono,
a utworzonego klienta testowego usunięto. Nie wykonano płatności, także
symulowanej płatności kartą. Odnowienia, zwroty i nadanie opłaconego dostępu
są dotąd sprawdzone testami z atrapami Stripe.

Cztery zdarzenia `checkout.session.expired` dotarły ze Stripe pod publiczny
adres HTTPS i zostały zapisane w `billing_events` po weryfikacji podpisu.
Stripe potwierdził dla nich `pending_webhooks: 0`. To potwierdza zewnętrzne
dostarczenie webhooków, poza samym sprawdzeniem lokalnego serwera.
Cennik opublikowano pod `https://miastowzasiegu.pl/cennik`; publiczny endpoint
`/api/billing/state` zwraca `enabled: true` i `mode: test`.
Raporty bez wartości kluczy są w `artifacts/billing-fixes/stripe-*-result.json`.

## Uruchomienie trybu testowego

1. Umieść klucz testowy w globalnym psst jako
   `MIASTO_W_ZASIEGU_STRIPE_SECRET_KEY`. Dla zgodności działa również poprzednia
   nazwa `MIASTOWZASIEGU_STRIPE_SECRET_KEY`; nowa ma pierwszeństwo.
   Preferowany jest ograniczony klucz
   `rk_test_`. Nie zapisuj wartości w repozytorium, argumentach poleceń ani czacie.
2. Uruchom przygotowanie katalogu i webhooka:

   ```powershell
   psst --global MIASTO_W_ZASIEGU_STRIPE_SECRET_KEY -- node scripts/configure-stripe.mjs
   ```

   Skrypt tworzy lub odczytuje cztery produkty o stabilnych identyfikatorach
   `miastowzasiegu_{premium,map,sponsored,donation}_v1`. Tworzy trzy stałe ceny
   miesięczne, sprawdzając kwotę, PLN i okres. Nie zmienia istniejącej błędnej
   ceny i nie wykonuje płatności. Wsparcie używa tego samego produktu oraz
   indywidualnej kwoty Checkout.
3. Skrypt rejestruje `/api/billing/webhook` i zapisuje nowy sekret podpisu do
   `MIASTOWZASIEGU_STRIPE_WEBHOOK_SECRET` przez stdin psst. Istniejący endpoint
   zachowuje pierwotny sekret; nie można odczytać go ponownie z API.
   Konfiguracja portalu trafia do `MIASTOWZASIEGU_STRIPE_PORTAL_CONFIG`.
4. Zrestartuj wyłącznie API tego projektu. Skrypty startowe wczytują z psst
   tylko jawnie wymienione nazwy. Sprawdź `/api/billing/state`: `mode: test`.
5. Na własnym koncie testowym sprawdź Checkout i portal, odnowienie, błąd
   płatności, anulowanie, zwrot i ponowienie webhooka. Nie używaj rzeczywistych
   danych kart ani fikcyjnych obserwacji w zwykłej bazie.

Klucz użyty do przygotowania potrzebuje zapisu Products, Prices, Webhook
Endpoints i Billing Portal Configurations. Uruchomienie aplikacji potrzebuje
zapisu Customers i Checkout Sessions, tworzenia sesji Billing Portal oraz
odczytu Prices, Subscriptions, Invoices, Invoice Payments, Charges i Disputes.
Po przygotowaniu można ograniczyć klucz do uprawnień uruchomieniowych.

Tryb live wymaga osobnego klucza, katalogu, sekretu webhooka i konfiguracji
portalu. Skrypt dodatkowo wymaga wtedy `--live`. Baza rozdziela klientów
i uprawnienia według trybu, więc zakup testowy nie nadaje uprawnień live.

## Przepływ i zabezpieczenia

- Serwer ustala ceny i waliduje bieżącego użytkownika Clerk, zgody oraz
  identyfikator istniejącego obiektu. Checkbox reklamodawcy jest deklaracją
  prawa do reklamy, a nie niezależną weryfikacją właściciela.
- W bazie powstaje zamówienie, a Stripe dostaje jego losowy identyfikator.
  Dane potrzeb dostępności, lokalizacja użytkownika i obserwacje z gry
  nie są przekazywane do Stripe. Przekazywane są dane klienta potrzebne do
  płatności oraz nazwa promowanego obiektu.
- Aktywne Checkout jest ponownie używane. Zmiana pakietu lub kwoty wygasza
  poprzednie Checkout przed utworzeniem nowego. Klucze idempotencji chronią
  tworzenie klienta, katalogu i sesji płatniczej.
- Webhook weryfikuje podpis na surowym body przed parserem JSON i auth.
  Dopiero opłacona faktura, właściwy produkt/kwota/okres oraz bieżący stan
  subskrypcji nadają uprawnienie. Parametr adresu sukcesu nie wystarcza.
- Powtórzone zdarzenia są zapamiętywane. Bieżący stan jest pobierany ze Stripe,
  a częściowe zwroty przechowują pozostałą kwotę niezależnie od kolejności
  faktury i zwrotu. Nieopłacone odnowienie nie przedłuża dostępu.
- Anulowanie przez portal kończy odnowienie. Obsługiwane są zarówno
  `cancel_at_period_end`, jak i `cancel_at`. Spór lub zbyt mała pozostała
  zapłata wyłącza uprawnienie z danej faktury.
- Reklamy są wyznaczane po filtrach miejsca, kategorii i dostępności.
  Maksymalnie pięć miejsc może otrzymać wyróżnienie mapy, a dwa sponsorowany
  priorytet. Dodatkowe pinezki mają tekstowy odpowiednik w liście. Premium
  usuwa wyróżnienia i płatną kolejność, zachowując same miejsca.
- Płatne wyróżnienia nie trafiają do lokalnej kopii offline. Odświeżenie
  lub powrót do karty ponownie ustala widoczność z API.

## Zakres testów i przygotowanie produkcji

`tests/backend/billing.test.mjs` sprawdza podpisy, ceny, uprawnienia konta,
duplikaty i zmiany Checkout, odnowienia, anulowanie, zwroty przed/po fakturze,
Invoice Payments, oddzielenie test/live, reklamy i wpłaty jednorazowe.
`tests/e2e/billing.spec.ts` sprawdza cennik mobilny i desktopowy, klawiaturę,
AXE, logowanie, zgody, formularze i ponowienie potwierdzenia. Testy przeglądarki
uruchamiają się na izolowanym API; dane Stripe są atrapami i nie wychodzą
do dostawcy. Nie wykonano testu czytnikiem ekranu.

Zweryfikowano 17 testów modułu płatności, 10 testów filtrów i serwera oraz
5 testów przeglądarki. Kompilacja TypeScript/Vite i generator service workera
zakończyły się powodzeniem. Pełny zestaw regresji backendu
został przerwany podczas tego zadania i nie jest objęty tym wynikiem.
Kompilacja do publikacji powstała w `artifacts/billing-deploy-dist`.
Po pięciu testach przeglądarki skopiowano ją do `dist`, zachowując poprzednie
zasoby. Odpowiedź publicznego `/cennik` porównano z opublikowanym `index.html`.
Środowisko zwykłych testów E2E jawnie wyłącza integrację Stripe, niezależnie
od kluczy odziedziczonych z otoczenia procesu.
Dodatkowy test publicznej strony potwierdził widoczny komunikat trybu testowego,
układ mobilny i desktopowy, przejście do logowania oraz odrzucenie anonimowego
zakupu (401) i nieprawidłowego podpisu webhooka (400).

Przed pobieraniem prawdziwych opłat trzeba potwierdzić dane sprzedawcy,
zasady reklamacji i zwrotów, prezentację cen oraz obowiązki podatkowe.
Stripe Tax pozostaje wyłączony. Jego włączenie wymaga potwierdzenia właściwych
aktywnych rejestracji, konfiguracji adresu firmy i podatków produktów.
Nie zakładaj, że samo włączenie `automatic_tax` nalicza podatek.

Przy kilku procesach API kolejka w pamięci nie wystarczy: blokowanie zakupów
i przetwarzanie zdarzeń trzeba przenieść do wspólnej transakcyjnej kolejki.
Obecna instalacja używa jednego procesu i SQLite. Przed skalowaniem potrzebne
są też niezależne sprawdzanie prawa do reklamy, zgłoszenia nadużyć, obsługa
klienta, kopie zapasowe bazy i okresowe uzgadnianie stanu ze Stripe.

Źródła: [Checkout](https://docs.stripe.com/payments/checkout),
[Billing](https://docs.stripe.com/billing/subscriptions/webhooks),
[Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal),
[Revenue Recovery](https://docs.stripe.com/billing/revenue-recovery),
[Stripe Tax](https://docs.stripe.com/tax/set-up).
