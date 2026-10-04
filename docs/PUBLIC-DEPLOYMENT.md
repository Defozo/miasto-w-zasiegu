# Własne wdrożenie

Publiczne demo projektu: https://miastowzasiegu.pl/. To prototyp, z ograniczeniami opisanymi w README i VERIFICATION.md.

Zbuduj web poleceniem `npm run build`, odtwórz dane według README i skonfiguruj własne usługi. `server/public-server.mjs` serwuje build i API; sprawdź jego zmienne PORT, HOST i ALLOW_REMOTE_ACCESS przed udostępnieniem. Użyj własnego reverse proxy z HTTPS, dokładnej listy originów Clerk i własnej konfiguracji webhooka Stripe. ORS wymaga osobnego uruchomienia oraz gotowych grafów. Nie wystawiaj bazy danych ani prywatnych plików jako statycznych zasobów.

Instrukcje startu Windows i harmonogramów w repozytorium opisują środowisko demonstracyjne. Przed użyciem we własnej instalacji dostosuj ścieżki, porty, domenę, monitoring i kopie zapasowe. Sam lokalny HTTP lub poprawna kompilacja nie potwierdza publicznego wdrożenia.
