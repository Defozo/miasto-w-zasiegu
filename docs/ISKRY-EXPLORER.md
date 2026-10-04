# Iskry Miasta i osiągnięcia odkrywców

Widok `/gra` łączy obserwowanie miasta z kolekcją odznak i własną kartą osiągnięć. Użytkownik wybiera potrzebne sprawdzenie, zapisuje własną obserwację i widzi wynik na profilu. Te same osiągnięcia zdobywa za kwalifikujące się zgłoszenia w głównej aplikacji. Poprzedni trening, ogród i album pozostają pod `/gra?tryb=ogrod`.

## Misje i wiarygodność danych

Misje ponownego sprawdzenia powstają z aktywnych zgłoszeń, które są nieaktualne albo mają zgłoszoną rozbieżność. Formularz pokazuje poprzedni opis i datę obserwacji lub potwierdzenia. Wyniki „opis nadal pasuje” i „widzę zmianę” są nagradzane jednakowo. Zgłoszenie zmiany zachowuje sprzeczność i nie usuwa samoczynnie przeszkody.

Misje odkrywania powstają przy miejscach z brakującymi informacjami o wejściu oraz przy ławkach bez bieżącej obserwacji. Data importu katalogu nie zastępuje sprawdzenia w terenie. Lokalizacja katalogowa może wskazywać środek obiektu; użytkownik osobno potwierdza rzeczywisty punkt obserwacji. GPS jest opcjonalny, a lista pozwala korzystać z misji bez mapy.

## Nagrody

| Wkład | XP |
| --- | ---: |
| Nowa konkretna obserwacja | 15 |
| Obserwacja z rzeczywistym pomiarem | 20 |
| Potrzebne ponowne sprawdzenie cudzego zgłoszenia | 25 |

Serwer przyznaje do pięciu nagród w kolejnych 24 godzinach, z odstępem co najmniej 90 sekund. Nowe obserwacje muszą pochodzić z ostatnich 24 godzin. Opis wymaga minimum 35 znaków, sześciu słów i pięciu różnych słów. Powtórzony zapis, kopia opisu i kolejne odkrycie tego samego rodzaju w promieniu 35 metrów przez tę samą osobę nie dają kolejnej nagrody. Ponowne nagrodzenie sprawdzenia tego samego zgłoszenia wymaga przynajmniej siedmiu dni oraz nadal istniejącej potrzeby aktualizacji. Zapis obserwacji może się udać mimo braku nagrody; interfejs podaje powód.

Sześć serii odznak obejmuje nowe odkrycia, aktualizacje, pomiary, miejsca odpoczynku, wejścia i różnorodność obserwacji. Każda ma trzy poziomy. Rangi zaczynają się od 0, 40, 120, 300, 700 i 1500 XP. Dodatkowe style karty odblokowują się przy 120 i 300 XP. Na wizytówkę można wybrać trzy zdobyte odznaki.

XP oznacza wkład w dane społeczności, nie niezależną weryfikację ani certyfikat dostępności. Trening nie daje tych osiągnięć. Zachowano jego osobny postęp, a wcześniejsze rzeczywiste obserwacje nagrodzone w starym trybie miasta są importowane jednokrotnie do nowego profilu.

## Zdjęcia i karta osiągnięć

Formularz korzysta z tego samego asystenta zdjęć co główna aplikacja. AI proponuje rodzaj i opis; użytkownik wybiera propozycję, sprawdza treść, lokalizację i datę. Wymiary podaje dopiero po własnym pomiarze. Problem przy ławce zostaje zgłoszeniem warunków lub przeszkody, a udogodnienie może trafić do osobnych dobrych odkryć. Zdjęcie nie potwierdza działania windy.

W tej wersji gra zapisuje punkt obserwacji. Odcinek lub obszar można opisać formularzem głównej aplikacji. Dźwięki są domyślnie wyłączone, a animacje respektują ograniczenie ruchu. Karta PNG powstaje na urządzeniu i zawiera wybraną nazwę, odznaki oraz liczniki. Nie zawiera współrzędnych ani zdjęć obserwacji. Udostępnienie następuje po działaniu użytkownika.

## Implementacja i sprawdzenie

`server/explorer.mjs` przechowuje nagrody i wybór wizytówki w SQLite. Wpisy mają unikalne klucze zdarzeń. Zapisy sprawdzają bieżące konto i uprawnienia do odznak oraz stylu. Integracja nagród znajduje się przy istniejących zapisach raportów, dobrych odkryć i potwierdzeń. Nowy widok ładuje mapę i formularz dopiero w miarę potrzeby.

Testy backendu uruchamia polecenie:

```powershell
node --test tests/backend/explorer.test.mjs tests/backend/game.test.mjs tests/backend/observations.test.mjs tests/backend/api.test.mjs tests/backend/report-photo.test.mjs
```

Przeglądarkowe scenariusze Iskier, wcześniejszego ogrodu, albumu i asystenta zdjęć są w `playwright.explorer.config.ts`. Korzystają z bazy w pamięci na porcie 3097 i podglądu na 4197. Testy nie publikują fikcyjnych obserwacji w zwykłej bazie. Propozycje AI są w tych scenariuszach kontrolowanymi odpowiedziami testowymi.

```powershell
node artifacts/iskry-explorer/build-release.mjs
node node_modules/@playwright/test/cli.js test --config playwright.explorer.config.ts
```

Skrypt przygotowuje osobny podgląd z zapisanej wersji bazowej i plików Iskier. `release.json` określa zgodność z bazową stroną publiczną. Gdy `publicationReady` wynosi `false`, całego katalogu nie należy publikować, bo cofnąłby równoległe zmiany aplikacji. Zmiany backendu wymagają uruchomienia nowej wersji serwera publicznego.

Publikacja samej gry korzysta z opcjonalnego `dist/iskry/index.html`, obsługiwanego przez serwer pod tym samym adresem `/gra`. Skrypt `artifacts/iskry-explorer/publish-game.mjs` sprawdza zgodność źródeł, dodaje brakujące pliki z niezmiennymi nazwami i zapisuje osobny dokument wejściowy. Nie zastępuje `dist/index.html` aplikacji. Kolejna pełna kompilacja usuwa ten dodatkowy dokument i przywraca wspólny dokument wejściowy, obejmujący aktualny kod gry. Wynik publikacji i sprawdzenia jest w `artifacts/iskry-explorer/publication.json`; jej logi serwera są w `artifacts/iskry-explorer/public-final.log` oraz `public-final-error.log`.

Wersję publiczną sprawdza `node scripts/check-explorer-public.mjs`. Ta kontrola blokuje zapisy API, porównuje opublikowany dokument z przygotowaną wersją, otwiera misje i kolekcję oraz sprawdza starszy trening. Zalogowane zapisy, nagrody i analiza zdjęcia pozostają testowane w izolowanym środowisku.

Sprawdzono eksport rzeczywistego PNG, utrzymanie postępu, zmianę konta, duplikaty, oba wyniki ponownego sprawdzenia, zdjęcia z problemem i udogodnieniem, klawiaturę, szerokość 390 px oraz wybrane widoki narzędziem AXE. Nie przeprowadzono w tej pracy testu rzeczywistym czytnikiem ekranu, odsłuchu na telefonie ani nowej analizy zdjęcia przez zewnętrzne OpenAI. Testy automatyczne nie potwierdzają pełnej zgodności WCAG.
