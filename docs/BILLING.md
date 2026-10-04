# Płatności i reklamy Miasta w zasięgu

Cennik zapisany w aplikacji: Premium 10 zł/miesiąc, reklama jednego obiektu na mapie
49 zł/miesiąc, mapa i sponsorowane wyniki 99 zł/miesiąc. Jednorazowe wsparcie
5-1000 zł nie odnawia się i nie nadaje Premium. Wszystkie kwoty są w PLN.
Strona `/cennik` jest również dostępna pod `/pricing`.

## Integracja Stripe

Prototyp integruje Stripe w trybie testowym. Nowa instalacja wymaga własnego konta, katalogu cen, konfiguracji portalu i webhooka.

Przyjęty wariant to hostowany Checkout, Billing dla abonamentów, jednorazowy
Checkout dla wsparcia oraz Customer Portal. Obsługę odzyskiwania nieudanych płatności, w tym Smart Retries, operator
konfiguruje osobno w panelu Stripe; nie jest ona automatycznie włączana przez aplikację.

Bez klucza API i sekretu
webhooka strona pokazuje ceny i informację „Płatności wkrótce”, a serwer
odrzuca zakup.

## Konfiguracja własnego trybu testowego

1. Przygotuj testowe konto Stripe i klucz API. Przekaż go jako `MIASTO_W_ZASIEGU_STRIPE_SECRET_KEY` albo zgodnościową nazwę `MIASTOWZASIEGU_STRIPE_SECRET_KEY`. Pierwsza nazwa ma pierwszeństwo. Klucz przechowuj w menedżerze sekretów, nie w repozytorium, APK ani historii poleceń.
2. Utwórz przez Stripe API lub własny skrypt produkty i ceny zgodne z kontraktem w `server/billing.mjs`. Same nazwy wyświetlane w panelu nie wystarczają: serwer sprawdza identyfikator produktu, kwotę, walutę, okres i `lookup_key`.

| Oferta | Identyfikator produktu | Cena w groszach | `lookup_key` ceny |
| --- | --- | ---: | --- |
| Premium | `miastowzasiegu_premium_v1` | 1000 | `mwz_v1_premium_pln_1000_month` |
| Mapa | `miastowzasiegu_map_v1` | 4900 | `mwz_v1_map_pln_4900_month` |
| Sponsorowane wyniki | `miastowzasiegu_sponsored_v1` | 9900 | `mwz_v1_sponsored_pln_9900_month` |
| Wsparcie | `miastowzasiegu_donation_v1` | wybór 500-100000 | bez stałej ceny |

Trzy stałe ceny muszą być aktywne, w `pln`, z okresem `month` i `interval_count: 1`. Wsparcie używa indywidualnej ceny jednorazowej Checkout, bez subskrypcji.

3. Utwórz endpoint webhooka `https://twoja-domena/api/billing/webhook` z rodzajami zdarzeń eksportowanymi jako `STRIPE_EVENTS` w `server/billing.mjs`. Sekret podpisu przekaż jako `MIASTOWZASIEGU_STRIPE_WEBHOOK_SECRET`. Skonfiguruj Customer Portal, m.in. historię, metodę płatności i zasady anulowania, oraz jego identyfikator w `MIASTOWZASIEGU_STRIPE_PORTAL_CONFIG`.
4. Ustaw `BILLING_PUBLIC_URL` na dokładny origin HTTPS własnej aplikacji, bez końcowego ukośnika. Zrestartuj proces API po zmianie środowiska i sprawdź `/api/billing/state`: `enabled: true`, `mode: test`. Ten odczyt nie potwierdza jeszcze wykonania płatności.
5. W odrębnym środowisku testowym sprawdź Checkout i portal, potwierdzenie płatności, odnowienie, błąd, anulowanie, zwrot i ponowienie webhooka. Testowy zakup nie może korzystać z prawdziwej karty ani tworzyć fikcyjnej obserwacji w zwykłej bazie.

Przygotowanie katalogu wymaga odpowiednich uprawnień do Products, Prices, Webhook Endpoints i Billing Portal Configurations. Działająca aplikacja potrzebuje uprawnień do klientów, Checkout, sesji portalu oraz odczytów cen, subskrypcji, faktur, płatności, obciążeń i sporów. Po konfiguracji ogranicz klucz do faktycznie potrzebnego zakresu.

Tryb live wymaga osobnego katalogu i kluczy, sekretu webhooka oraz konfiguracji portalu. Baza oddziela klientów i uprawnienia według trybu. Nie traktuj danych ani zakupów testowych jako danych live.

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
  Funkcja `promote` wyróżnia najwyżej pięć miejsc w przekazanym zestawie
  wyników. Podczas wyszukiwania lub wyboru kategorii najwyżej dwa z nich
  mogą uzyskać sponsorowany priorytet. Liczniki zerują się przy każdym
  wywołaniu: API oblicza promocje listy i opcjonalnego zbioru mapy osobno.
  Nie jest to globalny limit kampanii ani gwarancja wyświetlenia reklamy
  w każdym zapytaniu. Dodatkowe pinezki mają tekstowy odpowiednik w liście. Premium
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

Podział obowiązków, budżet i proponowane źródła finansowania: [utrzymanie i model biznesowy](OPERATIONS-AND-BUSINESS.md).
