# Granice wykorzystania zdjęć ulic i połączeń telefonicznych

Stan sprawdzenia: 3 października 2026. Dokument opisuje decyzje techniczne prototypu Miasto w zasięgu na podstawie oficjalnej dokumentacji. Nie wykonano telefonów, rejestracji usług ani zewnętrznych zapisów.

## Google Maps i Street View

Dla nowej integracji z adresem rozliczeniowym w Polsce zastosowanie mają [warunki Google Maps Platform dla EOG](https://cloud.google.com/terms/maps-platform/eea). Punkty 3.3.2(a-c) zakazują eksportowania i scrapingu treści poza usługami, przechowywania poza dozwolonymi wyjątkami i tworzenia danych na podstawie treści Maps. Osobno wymieniają użycie do trenowania, testowania, walidacji i dostrajania modeli AI. Wniosek projektowy: automatyczna baza barier wyekstrahowana ze zdjęć Street View nie jest dozwolonym zastosowaniem na standardowych warunkach. To ograniczenie nie sprowadza się do trenowania modelu.

Zwykła strona Maps podlega [warunkom użytkownika końcowego](https://www.google.com/help/terms_maps/), zmienionym 27 stycznia 2026. Ograniczają one m.in. kopiowanie treści z wymienionymi wyjątkami, masowe pobieranie i tworzenie określonych konkurencyjnych baz mapowych. To odrębny dokument od warunków API. Wniosek: zalogowanie do własnego konta, użycie pluginu lub automatyzacja przeglądarki nie przyznają dodatkowej licencji na pozyskiwanie danych.

**Decyzja prototypu:** linki do oficjalnego widoku Google dla człowieka, bez pobierania obrazów Google do analizy przez model lub budowy naszej bazy. [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) działają między platformami i nie wymagają klucza API. Obsługują wyszukiwanie, trasy i Street View przez `map_action=pano` z `viewpoint` lub identyfikatorem panoramy. Sam link nie stanowi potwierdzenia dostępności miejsca. Osadzanie Street View przez oficjalne API jest możliwe na właściwych warunkach i z wymaganymi oznaczeniami, ale nie zmienia ograniczeń tworzenia danych pochodnych.

## Alternatywne zdjęcia ulic

- **KartaView:** [warunki z 17 czerwca 2025](https://kartaview.org/terms), punkt 4, udostępniają zdjęcia ulic i dane przestrzenne 3D na CC BY-SA 4.0. Kod jest objęty MIT. Wymagana atrybucja to „© Grab and KartaView Contributors”. Warunki pozwalają kopiować i adaptować dane zgodnie z licencją.
- **Mapillary:** [oficjalna strona licencji](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data), aktualizacja 12 maja 2025, potwierdza CC BY-SA dla obrazów i linkuje do [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Przy wykorzystaniu zdjęcia należy zachować atrybucję i oznaczenie licencji. Warunki udostępniania adaptacji również mają znaczenie.

Nie potwierdzono pokrycia ani aktualności zdjęć w Krakowie. Licencji zdjęć Mapillary nie należy automatycznie przypisywać wszystkim wynikom API, gotowym detekcjom czy danym platformy. Pełny zakres dostępu API wymaga osobnego sprawdzenia. Rozsądny pierwszy test analizy obrazu to własne zdjęcia albo konkretny materiał z potwierdzonym prawem ponownego użycia. Osobno trzeba ocenić, czy widoczny fragment faktycznie pozwala ustalić próg lub szerokość. Obraz bez skali nie jest pomiarem.

## Android i rozmowa z numeru SIM

[Dokumentacja typowych intentów Androida](https://developer.android.com/guide/components/intents-common#Phone) rozróżnia:

- `ACTION_DIAL`: otwarcie dialera z numerem. Użytkownik naciska przycisk połączenia.
- `ACTION_CALL`: rozpoczęcie połączenia bez tego kroku, wymagające uprawnienia `CALL_PHONE`.
- `adb shell am start`: metoda testowego wysłania intentu. Nie tworzy dostępu do dźwięku rozmowy.

Według [dokumentacji współdzielenia wejścia audio](https://developer.android.com/media/platform/sharing-audio-input), przechwytywanie samego połączenia wymaga preinstalowanej, uprzywilejowanej aplikacji z `CAPTURE_AUDIO_OUTPUT`. [Opis uprawnienia](https://developer.android.com/reference/android/Manifest.permission#CAPTURE_AUDIO_OUTPUT) wskazuje, że nie jest ono przeznaczone dla aplikacji stron trzecich. Możliwość przechwytywania wejścia mikrofonu przez usługę dostępności nie jest równoznaczna z dostępem do obu stron rozmowy telefonicznej.

[Rola domyślnego dialera](https://developer.android.com/develop/connectivity/telecom/dialer-app) wymaga obsługi dialpada i `InCallService`, w tym interfejsu rozmowy. Samo uzyskanie tej roli nie zastępuje uprzywilejowanego dostępu do audio. Wniosek techniczny: możemy otworzyć lub zainicjować połączenie z SIM, ale standardowa aplikacja nie uzyskuje w ten sposób kompletnego kanału, w którym AI jednocześnie słucha rozmówcy i nadaje własny głos do połączenia komórkowego.

**Decyzja prototypu:** agent telefoniczny pozostaje odłożony. Rozmowa demonstracyjna w przeglądarce i przygotowanie pytań o konkretne bariery to propozycja następnego etapu, jeszcze nie zaimplementowana. Docelowy voice AI wymaga osobno skonfigurowanej telefonii PSTN/SIP albo eksperymentu ze sprzętowym mostem audio. Użycie obecnego numeru użytkownika jako identyfikacji połączenia wymaga potwierdzenia przez wybranego dostawcę. Nie należy obiecywać, że samo podłączenie telefonu przez USB lub ADB rozwiązuje ten problem.

Kolejność dalszych testów: rozmowa w przeglądarce, następnie osobno autoryzowany numer należący do zespołu, a dopiero po weryfikacji i osobnej autoryzacji kontakt z instytucją. Automatyczne połączenia nie są włączone w prototypie.
