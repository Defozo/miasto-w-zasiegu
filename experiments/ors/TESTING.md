# Test lokalnego ORS wheelchair

Uruchomienie z katalogu projektu, gdy ORS zakończy budowanie grafu:

```powershell
python experiments/ors/test_routes.py
```

Sam kontrolowany test błędu przy zablokowanym starcie:

```powershell
python experiments/ors/test_routes.py --case blocked-start
```

Domyślny adres to `http://127.0.0.1:18082/ors`. Można podać `--base-url` albo zmienną `ORS_BASE_URL`. Nie potrzeba klucza API ani dodatkowych pakietów Pythona. Test wykonuje tylko GET health/status oraz POST obliczający trasy. Nie zmienia danych OSM, konfiguracji ani grafu i nie wystawia usługi publicznie.

Każde uruchomienie tworzy nowy katalog `results/<czas UTC>`. Znajdują się tam dokładne żądania, odpowiedzi HTTP (JSON oraz surowe body), plan, sztuczny polygon w GeoJSON i `summary.json`. Nie należy używać istniejącego katalogu jako `--output`.

Punkty testowe są orientacyjnymi punktami na ulicach lub dojściach: Rynek/Floriańska, Grodzka i Kazimierz. Nie są potwierdzonymi dostępnymi wejściami. Test zapisuje odległość przesunięcia każdego końca przez snapping, ograniczony do 30 m. Nie potwierdza właściwej strony ulicy ani fizycznej dostępności.

## Kryteria

- Health musi zwrócić `ready`, status musi wskazać profil `wheelchair` z encoderem `wheelchair`. Status zapisuje wersję silnika i daty grafu/OSM.
- Każda z trzech bazowych tras musi zwrócić GeoJSON LineString, spójne indeksy kroków, niepuste komunikaty i zgodne sumy odległości/czasu w tolerancji zaokrągleń. Geometria pozostaje nieuproszczona.
- Bazowe parametry: schody wykluczone; maksymalne nachylenie 6%, krawężnik 6 cm, szerokość minimum 0,9 m, `smoothness=good`, `surface=sett`, `track=grade1`, `allow_unsuitable=false`, `surface_quality_known=false`. To jawny profil testowy, nie deklaracja parametrów odpowiednich dla każdej osoby.
- Wariant ścisły: nachylenie 3%, krawężnik 3 cm, szerokość 1,2 m oraz `surface_quality_known=true`. Poprawna trasa albo ORS 404 z kodem 2009/2010 są dopuszczalnymi wynikami. Błędy parametrów, sieci i serwera nigdy nie stają się poprawnym wynikiem. Brak trasy nie powoduje automatycznego poluzowania wymagań.
- Osobna diagnostyka ustawia `minimum_width=10` m z `surface_quality_known=false` na pierwszej poprawnej trasie. Odpowiedź z trasą ma status `DIAGNOSTIC_ROUTE_RETURNED`, nie sukces filtrowania szerokości. Trzeba skonfrontować ją z tagami szerokości rzeczywistych krawędzi OSM; brak szerokości może nie wykluczać odcinka. Brak trasy też nie dowodzi kompletności danych. Błąd parametrów/serwera pozostaje błędem.
- Sztuczny kwadrat bariery o boku około 12 m powstaje na środku jednego odcinka rzeczywiście znalezionej bazowej trasy. Test udowadnia przecięcie bazowej linii z polygonem, następnie wymaga innej linii bez takiego przecięcia. Jeśli dla pierwszej trasy nie ma objazdu, sprawdza kolejną, zachowując wszystkie próby. Co najmniej jeden rzeczywisty objazd jest wymagany do zaliczenia tej demonstracji. To nie jest zgłoszenie rzeczywistej bariery.
- Osobny wariant `--case blocked-start` obejmuje punkt startowy kwadratem o boku około 140 m, blokując cały promień snappingu 30 m. Warunkiem zaliczenia jest HTTP 404 i ORS 2009 albo 2010. Nie ma zmiany punktów, promienia ani wymagań i nie ma fallbacku. Ten wariant nie uruchamia ponownie trzech tras ani objazdu.
- Wynik `PASS` oznacza działanie API i geometrii. Nie dowodzi aktualności wszystkich tagów, poprawności przejść, dostępności wejścia, bezpiecznej nawigacji ani działania GPS w telefonie. `surface_quality_known` nie wymaga pełnego zestawu danych o wszystkich barierach.

## Wykonanie 3 października 2026

Wynik udanego uruchomienia: `results/20261003T004132.150748Z/summary.json`. ORS 10.0.1, OSM z 1 października 2026 20:22:06 UTC, profil `wheelchair`, health `ready`.

| Trasa | Bazowa | Ścisła |
| --- | ---: | ---: |
| Rynek / Floriańska | 306,0 m | 306,0 m |
| Grodzka | 369,4 m | 369,4 m |
| Kazimierz | 270,4 m | 665,6 m |

Wszystkie sześć odpowiedzi przeszło walidację geometrii i instrukcji. Sztuczna przeszkoda na Floriańskiej zmieniła trasę z 306,0 m na 481,8 m. Bazowa geometria przecina polygon, geometria objazdu go nie przecina.

Diagnostyczne wymaganie szerokości 10 m zwróciło tę samą trasę 306,0 m. Nie oznacza to potwierdzenia takiej szerokości. W kodzie ORS 10.0.1 filtr szerokości sprawdza tylko wartości większe od zera; zero oznacza brak danych. Ponadto `accept()` dopuszcza krawędź bez jakichkolwiek atrybutów wheelchair przed sprawdzeniem `surface_quality_known`. Źródło: [WheelchairEdgeFilter](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/edgefilters/WheelchairEdgeFilter.java), metody `accept`, `checkMinimumWidth`, `checkSurfaceQualityKnown`.

Osobny test zablokowanego startu (`results/20261003T004323.832555Z/summary.json`) zakończył się `PASS`: HTTP 404, kod 2010, komunikat o braku routowalnego punktu w promieniu 30 m dla punktu startowego. Dokładny request, polygon i odpowiedź są zachowane w tym samym katalogu.

Każda odpowiedź z trasą zawierała warning 4 o niedostępnej informacji `roadaccessrestrictions`. Test zapisuje to ostrzeżenie i go nie tłumi. W ORS 10.0.1 `ExtraInfoProcessor` automatycznie żąda tego extra, gdy `suppress_warnings=false`; brak encoded value `AccessRestriction.KEY` powoduje zapisanie brakującego extra. Dotyczy to dodatkowej informacji o ograniczeniach dostępu i generowania związanych z nią ostrzeżeń. `WheelchairFlagEncoder.getAccess()` nadal osobno sprawdza dostęp do dróg, a `WheelchairEdgeFilter` sprawdza parametry wheelchair. Sam warning nie dowodzi wyłączenia tych filtrów ani ich skuteczności w terenie.

Proponowana poprawka konfiguracji przy kolejnej kontrolowanej przebudowie grafu, niewykonana w tym teście:

```yaml
ors:
  engine:
    profiles:
      wheelchair:
        build:
          ext_storages:
            RoadAccessRestrictions:
              use_for_warnings: true
```

Należy dopisać ten wpis do istniejącej konfiguracji, zachowując pozostałe storage. W kodzie 10.0.1 `BuildProperties.initializeExtStorages()` obsługuje tę nazwę i `handleAccessRestrictions()` włącza `encodedValues.setAccessRestriction(true)`. To nadal obsługiwany alias konfiguracji, chociaż implementacja danych przeszła na encoded values. Sam restart z istniejącym grafem nie uzupełni brakujących danych. Po przebudowie trzeba ponownie sprawdzić status, trasę z `extra_info=["roadaccessrestrictions"]` oraz zniknięcie warning 4. Nie testowano tej poprawki na działającym grafie.

Pierwsza próba (`results/20261003T004110.648418Z`) ujawniła błąd nagłówka klienta: `Accept: application/json` przy endpointzie GeoJSON powodował HTTP 406 / ORS 2007. Skrypt poprawiono na `Accept: application/geo+json`. Dowody nieudanej próby zachowano; żadnych ograniczeń routingu nie poluzowano.

## Źródła sprawdzone przed implementacją

- [ORS requests / GeoJSON / steps](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types)
- [ORS routing options / avoid_polygons / wheelchair](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options)
- [Schemat profile_params dla wersji 10.0.1](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-api/src/main/java/org/heigit/ors/api/requests/routing/RequestProfileParams.java)
- [Schemat ograniczeń dla wersji 10.0.1](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-api/src/main/java/org/heigit/ors/api/requests/routing/RequestProfileParamsRestrictions.java)
- [Schemat żądania dla wersji 10.0.1](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-api/src/main/java/org/heigit/ors/api/requests/routing/RouteRequest.java)
- [Health](https://giscience.github.io/openrouteservice/api-reference/endpoints/health/) i [status](https://giscience.github.io/openrouteservice/api-reference/endpoints/status/)
- [ExtraInfoProcessor 10.0.1: automatyczne extra i brak encoded value](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/pathprocessors/ExtraInfoProcessor.java)
- [BuildProperties 10.0.1: obsługa RoadAccessRestrictions](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/config/profile/BuildProperties.java)
- [WheelchairFlagEncoder 10.0.1: niezależna kontrola dostępu](https://github.com/GIScience/openrouteservice/blob/v10.0.1/ors-engine/src/main/java/org/heigit/ors/routing/graphhopper/extensions/flagencoders/WheelchairFlagEncoder.java)
