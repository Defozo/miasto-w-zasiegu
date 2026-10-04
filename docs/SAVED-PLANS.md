# Zapis planu i prywatność

Plan jest pojedynczym historycznym wynikiem obliczenia, przechowywanym w tej przeglądarce. Nie synchronizuje się z Androidem ani innymi urządzeniami. Nowy zapis zastępuje poprzedni; interfejs mówi o tym przy przycisku zapisu. Karta pokazuje adresy, dystans, liczbę przystanków i datę obliczenia. Ponowny zapis nie odmładza `route.source.computedAt`. Usunięcie wymaga potwierdzenia, a zmiana lub usunięcie zapisu w innej karcie odświeża widok.

Zapis ma `scope` i `ownerId`:

- `account`: domyślny zapis osoby zalogowanej. Przeglądarka pokazuje go dopiero po sprawdzeniu bieżącej sesji i zgodności właściciela. Nie można otworzyć go podczas sprawdzania konta, po nieudanym sprawdzeniu ani po ponownym uruchomieniu bez sieci. Utrata połączenia lub weryfikacji zamyka aktywny odtworzony plan tego typu. Samo przechowywanie jest lokalne.
- `device`: zapis gościa albo jawnie wybrany przez zalogowaną osobę „Dostęp bez logowania na tym urządzeniu”. Przed zapisem wyświetlamy informację, że inne osoby korzystające z urządzenia mogą odczytać adresy, potrzeby i instrukcje. Takie instrukcje można otworzyć offline; kafelki mapy nadal wymagają internetu. Zapis pozostaje po wylogowaniu.

Starszy format bez właściciela i zakresu pozostaje ukryty. Nie przypisujemy go automatycznie kolejnemu kontu ani gościowi. Interfejs prosi o ponowne obliczenie i zapisanie trasy.

Ochrona interfejsu przed pomieszaniem kont nie jest szyfrowaniem localStorage ani zabezpieczeniem przed osobą mającą bezpośredni dostęp do plików przeglądarki lub narzędzi deweloperskich. Prywatny zapis offline z lokalnym odblokowaniem wymaga osobnego mechanizmu i nie jest zaimplementowany.

Odtworzony plan pokazuje potrzeby zapisane przy jego obliczeniu. Zmiana początku, celu, przystanków, profilu lub omijania przeszkód unieważnia stary wynik i wraca do obecnych potrzeb. Samo oglądanie miejsca w zakładce Odkrywaj zachowuje trasę. Nowy cel zostaje wybrany dopiero po „Zaplanuj przejście”.

Widoczność zapisów i odpowiedzi asynchronicznych jest sprawdzana w `saved-plan-privacy.spec.ts`; rzeczywiste wyniki przebiegów zapisujemy w [VERIFICATION.md](VERIFICATION.md). Testy używają odrębnej bazy w pamięci, nie kont użytkowników.
