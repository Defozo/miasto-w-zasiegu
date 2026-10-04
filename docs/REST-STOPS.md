# Przerwa po drodze

Przy obliczonej trasie web pokazuje opcjonalną sekcję „Przerwa po drodze”. Zawiera do sześciu ławek, toalet i aktualnych obserwacji miejsca odpoczynku w pobliżu rzeczywistego przebiegu drogi. Podgląd na mapie nie zmienia planu. „Dodaj jako przystanek” dopisuje punkt po dotychczasowych przystankach, przed celem, zachowuje oba końce i wymaga ponownego obliczenia. Kolejność można potem zmienić zwykłymi przyciskami przystanków.

Ta sama akcja jest dostępna przy dobrych odkryciach mieszkańców. Limit pięciu przystanków pozostaje wspólny. Powtórny punkt o tym samym identyfikatorze lub odległy o mniej niż 15 m od innego wybranego punktu nie jest dopisywany. Edycja planu usuwa wcześniejszą geometrię, żeby nie sugerowała drogi uwzględniającej nowy punkt przed jej obliczeniem.

## Dane i dobór

Import OSM Małopolski dostarcza katalog miejsc, w tym ławki i toalety; liczba rekordów zależy od wersji danych. Zachowuje zasady dostępu, godziny źródłowe, opłaty, oparcie i podłokietniki. Anonimowe ławki nie wypierają adresów i nazwanych obiektów z domyślnej wyszukiwarki. Domyślna nazwa toalety brzmi „Toaleta”, bez zakładania publicznego dostępu.

`server/stops.mjs` wybiera punkty w odległości do 200 m od wszystkich segmentów zwróconej geometrii. Nie wysyła kolejnego żądania do silnika tras. Pomija prywatne i zakazane miejsca, wpisy z jawnym brakiem dostępności na wózku oraz środki obszarów, które nie wskazują wejścia. Ograniczenia takie jak dostęp tylko dla klientów są widoczne przed dodaniem. Dobór pozostawia miejsce różnym rodzajom punktów, żeby liczne ławki nie wyparły wszystkich toalet.

Obserwacje `rest_place` są pobierane na bieżąco z bazy. Wycofane, przyszłe lub przeterminowane wpisy nie trafiają do wyników. Interfejs ponownie sprawdza datę ważności przed dopisaniem przystanku; zapisany dawniej plan nie wyświetla tych propozycji jako aktualnych.

`GET /api/places` nadal umożliwia obejrzenie warunków obiektu. `PlaceFacts` jawnie pokazuje klientom ograniczenia, godziny i opłaty, również gdy użytkownik znalazł miejsce samodzielnie. Nie ocenia aktualnego otwarcia na podstawie samego tekstu godzin.

## Kontrakt i ograniczenia

`POST /api/route` zwraca dodatkowe `stopSuggestions`. Wynik zawiera `id`, `kind`, `point`, `distanceFromRouteMeters`, źródło, daty, `details`, `warnings` i `restrictions`. Odległość oznacza linię prostą do geometrii, nigdy długość dojścia ani objazdu. Ponowne obliczenie trasy może się nie udać dla wybranego punktu i potrzeb użytkownika.

Istnienie ławki nie potwierdza miejsca obok niej, możliwości przesiadania się ani dostępnego dojścia. Data zmiany rekordu mapy nie potwierdza obecnych warunków. Nie znamy rzeczywistego otwarcia ani kompletnej dostępności toalet. Źródła oraz szczegóły pozostają dostępne przy każdej propozycji.

## Testowanie

Testy obejmują wybór punktów względem całych segmentów trasy, zakrzywioną geometrię, odległości, ograniczenia, daty obserwacji, różnorodność i limit. Scenariusze przeglądarkowe sprawdzają dopisanie przystanku i przeliczenie, podgląd bez zmiany planu, duplikat i przeterminowanie. Osobno sprawdzane są jawne opłaty oraz dostęp tylko dla klientów. [Uruchamianie testów](TESTING.md).
