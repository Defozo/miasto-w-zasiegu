# Własne wdrożenie

Publiczne demo projektu jest dostępne pod [miastowzasiegu.pl](https://miastowzasiegu.pl/). Własna instalacja wymaga danych, konfiguracji usług, działających grafów ORS, trwałego dysku i reverse proxy HTTPS. [README](../README.md) opisuje pierwsze pobranie danych; [utrzymanie](OPERATIONS-AND-BUSINESS.md) opisuje proponowane kopie, odpowiedzialność i budżet pilotażu.

## Serwer i proxy

`npm run build` tworzy `dist`. `server/public-server.mjs` obsługuje build i API w jednym procesie. Obecny punkt wejścia nasłuchuje na `0.0.0.0:4180`; port i host są zapisane w tym pliku. Nie są sterowane zmiennymi `PORT` i `HOST`, których używa odrębny deweloperski `server/index.mjs`.

Serwer publiczny akceptuje określony adres proxy oraz żądania loopback i ogranicza nagłówek Host do domen projektu. Przed uruchomieniem na własnej domenie dostosuj `DOMAINS`, `proxyIp` i adres nasłuchu w tej konfiguracji. Nie wyłączaj weryfikacji hosta ani nie ufaj dowolnemu `X-Forwarded-For`. Proxy ma przekazywać właściwy Host i protokół, kończyć TLS oraz ograniczać dostęp do portu aplikacji.

Ustaw środowisko procesu, w tym `DB_PATH`, adresy ORS, dokładne `CLERK_AUTHORIZED_PARTIES` i `BILLING_PUBLIC_URL` dla własnej domeny. `BILLING_PUBLIC_URL` jest samym originem HTTPS, bez końcowego ukośnika. `.env` wymaga jawnego załadowania, np. `node --env-file=.env server/public-server.mjs`. Nie wystawiaj `server/data`, sekretów, kopii i katalogu roboczego jako zasobów statycznych.

## Dane i integracje

Silniki ORS uruchom osobno, zgodnie z [instrukcją](../experiments/ors/README.md). Importy danych miejskich mogą być chwilowo niedostępne; aplikacja powinna pokazywać błąd lub poprzednią wersję z rzeczywistą datą. [Harmonogram Windows](DATA-IMPORT-SCHEDULE.md) opisuje środowisko demonstracyjne i wymaga dostosowania ścieżek oraz procesu aktywacji do własnego hosta.

Clerk wymaga konfiguracji domeny, metod logowania i callbacka Androida. Google wymaga własnego klucza przeglądarkowego ograniczonego do domen i odpowiednich API. Stripe wymaga katalogu, portalu i sekretu podpisu webhooka tej samej instancji. Tryb testowy jest oddzielony od live. Szczegóły: [AUTH.md](AUTH.md), [BILLING.md](BILLING.md).

Dla widgetu `/embed/places/:placeId` skonfiguruj możliwość osadzania na docelowych stronach, zachowując odrębne ograniczenia stron konta. Pliki APK muszą wskazywać właściwy backend HTTPS. Filmy, APK i PDF trzeba osobno dołączyć do publicznych materiałów; repozytorium źródeł ich nie zawiera.

## Odbiór i cofnięcie wdrożenia

Przed podmianą zachowaj poprzedni build, stan konfiguracji i spójną kopię bazy. Uruchom [testy](TESTING.md) w izolowanym środowisku. Po aktualizacji sprawdź rzeczywisty publiczny HTTPS: `/api/health`, stronę, mapę z listą, trasę i wybrane integracje. Zdrowie lokalnego portu nie potwierdza działania proxy ani dostępu z telefonu.

Przy błędzie przywróć zgodny poprzedni build i konfigurację. Nie nadpisuj nowszych danych użytkowników starszą bazą bez osobnego planu migracji. Archiwizacja kodu i poprawna kompilacja nie zastępują kopii danych ani testu odtwarzania.
