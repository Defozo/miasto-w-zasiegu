# Podgląd Google i zasady wykorzystania zdjęć ulic

Dokument opisuje ograniczenia techniczne i zasady przyjęte dla prototypu na podstawie dokumentacji dostawców. Warunki były analizowane 3 października 2026; przed zmianą sposobu wykorzystania trzeba sprawdzić ich aktualną wersję.

## Google Maps i Street View

Dla nowej integracji z adresem rozliczeniowym w Polsce zastosowanie mają [warunki Google Maps Platform dla EOG](https://cloud.google.com/terms/maps-platform/eea). Punkty 3.3.2(a-c) zakazują eksportowania i scrapingu treści poza usługami, przechowywania poza dozwolonymi wyjątkami i tworzenia danych na podstawie treści Maps. Osobno wymieniają użycie do trenowania, testowania, walidacji i dostrajania modeli AI. Wniosek projektowy: automatyczna baza barier wyekstrahowana ze zdjęć Street View nie jest dozwolonym zastosowaniem na standardowych warunkach. To ograniczenie nie sprowadza się do trenowania modelu.

Zwykła strona Maps podlega [warunkom użytkownika końcowego](https://www.google.com/help/terms_maps/), zmienionym 27 stycznia 2026. Ograniczają one m.in. kopiowanie treści z wymienionymi wyjątkami, masowe pobieranie i tworzenie określonych konkurencyjnych baz mapowych. To odrębny dokument od warunków API. Wniosek: zalogowanie do własnego konta, użycie pluginu lub automatyzacja przeglądarki nie przyznają dodatkowej licencji na pozyskiwanie danych.

**Decyzja prototypu:** oficjalny podgląd Google dla człowieka, bez pobierania obrazów Google do analizy przez model lub budowy naszej bazy. Przy krokach trasy działa opcjonalna ramka Maps Embed API, otwierana na żądanie, z zachowaniem atrybucji i odnośników dostawcy. [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) działają między platformami i nie wymagają klucza API. Obsługują wyszukiwanie, trasy i Street View przez `map_action=pano` z `viewpoint` lub identyfikatorem panoramy. Sam link nie stanowi potwierdzenia dostępności miejsca. Osadzanie Street View przez oficjalne API jest możliwe na właściwych warunkach i z wymaganymi oznaczeniami, ale nie zmienia ograniczeń tworzenia danych pochodnych.

## Alternatywne zdjęcia ulic

- **KartaView:** [warunki z 17 czerwca 2025](https://kartaview.org/terms), punkt 4, udostępniają zdjęcia ulic i dane przestrzenne 3D na CC BY-SA 4.0. Kod jest objęty MIT. Wymagana atrybucja to „© Grab and KartaView Contributors”. Warunki pozwalają kopiować i adaptować dane zgodnie z licencją.
- **Mapillary:** [oficjalna strona licencji](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data), aktualizacja 12 maja 2025, potwierdza CC BY-SA dla obrazów i linkuje do [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Przy wykorzystaniu zdjęcia należy zachować atrybucję i oznaczenie licencji. Warunki udostępniania adaptacji również mają znaczenie.

Nie potwierdzono pokrycia ani aktualności zdjęć w Krakowie. Licencji zdjęć Mapillary nie należy automatycznie przypisywać wszystkim wynikom API, gotowym detekcjom czy danym platformy. Pełny zakres dostępu API wymaga osobnego sprawdzenia. Rozsądny pierwszy test analizy obrazu to własne zdjęcia albo konkretny materiał z potwierdzonym prawem ponownego użycia. Osobno trzeba ocenić, czy widoczny fragment faktycznie pozwala ustalić próg lub szerokość. Obraz bez skali nie jest pomiarem.
