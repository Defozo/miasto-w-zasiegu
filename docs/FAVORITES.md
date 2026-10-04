# Zapisane miejsca

Moduł: `server/favorites.mjs`. Montowanie przez `registerFavorites(app, {db,getUser})` po parserze JSON, przed obsługą 404. `getUser(req)` jest synchroniczny. Tabela SQLite `favorites` powstaje automatycznie. Nie wymaga importu nowych danych, dostępu do internetu ani restartu grafu tras.

## Kontrakt

Konto jest wymagane. Cookie sesji i Bearer używają tej samej listy. Zapisane adresy są prywatne dla konta; odpowiedzi nie zawierają identyfikatora właściciela i mają `Cache-Control: no-store`.

- `GET /api/favorites` → 200 `{favorites:[Favorite]}`, kolejność od najstarszego zapisu.
- `POST /api/favorites` z `{label,point,expectedUserId?}` → 201 `Favorite`. Dokładny duplikat zwraca 200 i dotychczasowy rekord bez zmiany danych lub daty.
- `DELETE /api/favorites/:id` → 200 `{ok:true}`. Opcjonalne body `{expectedUserId}` chroni przed zmianą konta w innej karcie. Nieistniejący i cudzy identyfikator dają identyczne 404 `NOT_FOUND`.

```json
{
  "id": "uuid-nadany-przez-serwer",
  "label": "Dom",
  "point": {
    "id": "id-wybranego-punktu",
    "label": "Adres wybrany z podpowiedzi",
    "coordinates": [19.938, 50.061],
    "kind": "address",
    "precision": "address",
    "sourceLabel": "Opcjonalny opis źródła",
    "sourceUrl": "https://www.openstreetmap.org/",
    "coordinateKind": "representative-center"
  },
  "createdAt": "2026-10-03T12:00:00.000Z",
  "updatedAt": "2026-10-03T12:00:00.000Z"
}
```

Przykład jest wyłącznie ilustracją kontraktu, nie deklaracją czyjegoś adresu. `precision='address'` znaczy dopasowanie adresowe; nie potwierdza dostępnego wejścia. Serwer przechowuje wybrany punkt bez dopisywania pomiarów dostępności i nie pobiera `sourceUrl`.

## Walidacja i duplikaty

`label`: 1–80 znaków. `point.id`: 1–160, `point.label`: 1–250. Bez znaków sterujących. `kind`: `address|place|street`, `precision`: `address|approximate`. Współrzędne to dokładnie dwie skończone liczby `[lon,lat]` w takim samym obszarze jak trasy: lon 19.75–20.25, lat 49.9–50.2. Opcjonalne `sourceLabel` do 250 znaków, `coordinateKind` do 80, `sourceUrl` do 2048 i tylko poprawne HTTPS bez danych logowania. Nieznane pola nie są zapisywane.

Duplikat oznacza **na tym samym koncie** tę samą etykietę po usunięciu skrajnych i nadmiarowych spacji, zignorowaniu wielkości liter i normalizacji Unicode, oraz obie współrzędne zaokrąglone do 6 miejsc. Punkt zachowuje oryginalne współrzędne, a porównanie toleruje jedynie drobną różnicę zapisu liczby. Różne etykiety, np. Dom i Praca w tym samym budynku, są osobnymi zapisami. Zmiana współrzędnych także tworzy osobny zapis. Ponowienie nie nadpisuje starego opisu punktu lub źródła. Nie ma upsertu ani endpointu zmiany nazwy; można świadomie dodać nowy zapis i usunąć stary.

Limit: 30 zapisów na konto, 409 `FAVORITE_LIMIT` przy próbie dodania nowego ponad limit. Duplikat działa również przy pełnej liście. Sprawdzenie limitu i zapis odbywają się w jednej transakcji SQLite. Klient nie może wybrać właściciela przez `userId`. Gdy przekazano `expectedUserId`, różnica względem bieżącej sesji daje 409 `ACCOUNT_CHANGED`, również przy usuwaniu. Brak konta daje 401 `AUTH_REQUIRED`; błędne pola 400 `INVALID_FAVORITE`, a współrzędne używają istniejących kodów `INVALID_INPUT|OUTSIDE_AREA`.

Lista gościa pozostaje odpowiedzialnością klienta, osobno od konta. Logowanie nie importuje automatycznie lokalnych zapisów. Po zmianie konta klient powinien odrzucić poprzednie odpowiedzi, wyczyścić widok i pobrać nową listę.

## Weryfikacja

```powershell
node --test tests/backend/favorites.test.mjs
```

Testy korzystają z prawdziwej obsługi kont i sesji, osobnych portów przydzielonych przez system oraz SQLite w pamięci lub pliku tymczasowym. Sprawdzają prywatność kont, fałszowanie właściciela, cookie/Bearer, usuwanie, duplikaty bez nadpisania, aliasy i zmienione punkty, limit i zwolnienie miejsca, walidację, odrzucenie pól dodatkowych, zmianę konta oraz trwałość po ponownym otwarciu bazy. Nie zapisują testowych adresów w działającej bazie.

Publiczne zgłoszenia mają dodatkowo `canResolve`: true tylko dla aktywnego zgłoszenia anonimowego lub własnego. Klient powinien na tej podstawie pokazywać przycisk rozwiązania i odświeżać zgłoszenia po zmianie konta. Serwer nadal sam sprawdza uprawnienia.
