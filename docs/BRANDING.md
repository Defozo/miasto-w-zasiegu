# Miasto w zasięgu

Obowiązująca nazwa produktu: **Miasto w zasięgu**. Adres:
https://miastowzasiegu.pl/. Gra towarzysząca zachowuje nazwę **Iskry Miasta**.

Logotyp tekstowy ma dwie linie: „miasto” i „w zasięgu”. Web używa wspólnego
komponentu `web/src/BrandName.tsx`, dzięki czemu nazwa mieści się również
w nagłówku telefonu. Wspólny `web/src/BrandMark.tsx` rozwija motyw drogi
i kierunku. Ten sam znak występuje na stronie, w aplikacji, ekranie ładowania
oraz w ikonach SVG i PNG instalowanej PWA. Kolory marki to krem, ciemna zieleń
i limonka, uzupełnione szałwią, terakotą i zgaszonym błękitem.

Zmiana obejmuje stronę informacyjną, aplikację, tytuł i opis strony, manifest
PWA, logowanie i rejestrację, odnośniki w grze, wydruk planu, widżet obiektu
oraz teksty w edytorze paszportów. W kodzie Androida i Wear OS zmieniono nazwę
launchera, nagłówki oraz tytuł powiadomienia GPS.

Nazwa aplikacji Clerk `app_3KBXss0ao5erPmqRd9JCCMljEwC` została zmieniona
przez Platform API. Deklaracja jest w `config/clerk-branding.json`.
Nie zmieniano kont, kluczy logowania, identyfikatora aplikacji Android,
callbacków OAuth ani kluczy zapisanych preferencji. Ich techniczne nazwy
zachowano dla zgodności z istniejącymi instalacjami i danymi użytkownika.

## Weryfikacja 3 października 2026

- TypeScript przeszedł kontrolę bez błędów. Vite i budowanie service workera
  zakończyły się poprawnie w `artifacts/rebrand-dist`.
- Sprawdzono stronę wejściową na komputerze oraz mobilny widok aplikacji,
  logowania i gry przy szerokości 390 px. Nowa nazwa mieści się w nagłówkach;
  na tych widokach nie wystąpiło poziome przepełnienie ani błąd JavaScript.
  Aplikacja i gra mieszczą się również w szerokości 320 px. Sprawdzono nową
  nazwę w stanie niedostępnego obiektu we widżecie, bez zapisywania danych.
- Potwierdzono nowe tytuły i branding na publicznych adresach `/`, `/app`,
  `/sign-in`, `/sign-up` i `/gra`. Formularze logowania i rejestracji pokazują
  nową nazwę pobraną z Clerk. Nie zakładano testowych kont.
- Publiczny `manifest.webmanifest` zwraca nową nazwę i nazwę skróconą.
- Sprawdzono 25 szablonów e-mail i ustawienia komunikacji Clerk; nie zawierają
  starej nazwy wpisanej na sztywno.
- Kompilacja `:phone:assembleDebug :wear:assembleDebug` zakończyła się
  powodzeniem. APK telefonu używa `https://miastowzasiegu.pl` jako backendu.
  Pakiety testowe zapisano w `artifacts/releases/miasto-w-zasiegu-2026-10-03/`:
  `miasto-w-zasiegu-android.apk` i `miasto-w-zasiegu-wear-os.apk`.
  Nie instalowano ich na fizycznych urządzeniach w ramach tej zmiany.
- Przykładowe zrzuty: `artifacts/rebrand-desktop.png`,
  `artifacts/rebrand-public-mobile.png`, `artifacts/rebrand-login-mobile.png`
  i `artifacts/rebrand-game-mobile.png`.

Równolegle inne zadanie opublikowało nowszy build zawierający rebranding.
Zweryfikowano go na publicznej domenie; nie zastępowano go starszym buildem
z katalogu podglądu. Kontrola layoutu nie jest pełnym audytem czytnika ekranu.

Końcowa kontrola przebudowy UI wykryła testowy adres API w poprzednim APK telefonu, mimo innej konfiguracji projektu. Pakiet telefonu z powyższego katalogu został przebudowany i zweryfikowany bezpośrednio w manifeście oraz DEX. Używa `https://miastowzasiegu.pl`; SHA256: `a04230c0825b6990a422efcdc2acfda4bc4c54539ce485858cc260f82031dcb4`. Szczegóły i zakres testów urządzenia są w [VERIFICATION.md](VERIFICATION.md). Pakiet Wear OS nie był zmieniany w tej korekcie.

## Nowa oprawa web, 3 października 2026

Zmiana przygotowana w kodzie i lokalnym podglądzie na porcie 5173. Build do
weryfikacji znajduje się w `artifacts/visual-refresh-dist`. W ramach tej pracy
nie zastępowano publicznego katalogu `dist` ani nie przebudowywano APK.

- Strona wejściowa: typografia, ilustracja Krakowa, nowy układ sekcji i interaktywny
  przykład informacji o wejściu, nawierzchni i odpoczynku. Przykładowe dane są
  oznaczone, nie opisują rzeczywistego obiektu i nie trafiają do API.
- Aplikacja: wspólny znak, karty miejsc, pastelowe ikony kategorii, nawigacja,
  nagłówek mobilny i stany wyboru. Źródła i nieznane warunki pozostają widoczne.
- Motion for React 14.0.0: krótkie wejścia sekcji, przejścia przykładu i reakcja
  przycisków na dotyk. Funkcje animacji ładowane osobnym modułem. Wspólny
  `MotionPolicy` reaguje na preferencję systemu i ustawienie aplikacji, również
  po zmianie bez przeładowania. Ruch dekoracyjnej trasy można zatrzymać.
  Wdrożenie korzysta z [LazyMotion](https://motion.dev/docs/react-lazy-motion)
  i [zasad ograniczania ruchu](https://motion.dev/docs/react-accessibility).

Pliki graficzne:

- `web/public/brand/miasto-mark.svg`: znak, odtworzony również w komponencie
  `BrandMark.tsx`; `web/public/icon.svg` i ikony PNG 192/512 px używają tego samego rysunku.
- `web/public/brand/krakow-city-720.webp` (około 67 KiB) i
  `web/public/brand/krakow-city-1440.webp` (około 194 KiB): responsywna ilustracja,
  generowana wbudowanym narzędziem image_gen bez zewnętrznych obrazów wzorcowych.
  To wizja artystyczna, a nie dowód dostępności ani mapa.
- Oryginał: `artifacts/visual-refresh/krakow-city-source.png`. Pełny prompt:
  `artifacts/visual-refresh/image-prompt.txt`. Konwersja do WebP przez Sharp.
- Service worker uwzględnia własne obrazy WebP. Sprawdzono przeładowanie strony
  i wyświetlenie ilustracji offline po pierwszym pobraniu. Nie dodano cache map
  zewnętrznych ani danych API.

Weryfikacja:

- TypeScript i produkcyjny build Vite przeszły. Pozostaje ostrzeżenie Vite
  o dużym module MapLibre.
- 6 istniejących testów E2E przeszło: klawiatura od wyszukania miejsca do planu,
  zapis miejsca, mobilna lista oraz błędy sieci przy 320, 390 i 430 px.
  Wynik: `artifacts/visual-refresh/regression-results.json`.
- Dodatkowo sprawdzono aktualny dialog filtrów z zakładek Mapa, Zapisane i Profil,
  utrzymanie i przywracanie fokusu, interaktywny przykład oraz obie preferencje
  ograniczenia ruchu. Starszy test w `map-filters.spec.ts:454` zatrzymał się na
  nieaktualnej nazwie „Na razie pomiń”; jego późniejszy scenariusz również
  odwołuje się do dawnej nawigacji. Nie zmieniano tego pliku testowego.
- Brak poziomego przepełnienia strony i mapy przy 320, 390, 700/768, 1024 i
  1440 px; sprawdzono również małe widoki z dużym tekstem i mocniejszym kontrastem.
- AXE: zero naruszeń w trzech sprawdzonych stanach, z tagami WCAG 2 A/AA,
  2.1 AA i 2.2 AA. Wynik: `artifacts/visual-refresh/verification.json`.
- Zrzuty: `artifacts/visual-refresh/hero-desktop.png`, `landing-mobile.png`,
  `app-desktop.png` i `app-mobile.png`. Nie wykonano testu czytnika ekranu ani
  na fizycznym telefonie. Wyniki nie stanowią pełnego audytu WCAG.
