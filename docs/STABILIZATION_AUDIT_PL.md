# Audyt i stabilizacja — etap 1

> Dokument historyczny etapu 1. Aktualny stan i rozwiązanie ograniczeń localStorage opisuje [raport wersji 2](RELEASE_V2_PL.md).

Data: 31 października 2026. Repozytorium: `tentypcic/plc_program_viewer_cms`.

## Zakres i punkt przywracania

Audyt kodu HTML/CSS/JS, katalogu projektów, importu, edycji drzewa, zapisu, linków, instrukcji i routingu GitHub Pages. Zmiany wyłącznie na `develop/plc-viewer-modernization`. Punkt przywracania: commit **ffd7fb905e6686ea595cfa8dcfc6fb3c1ff21934**. Porównanie z tym commitem przedstawia cały zakres stabilizacji. Nie zmieniono main, publicznego demo ani danych przykładowych.

Przed aktualizacją wyeksportuj `projects.json` z używanej przeglądarki. Cofnięcie kodu: utwórz osobny branch z powyższego SHA albo odwróć commity stabilizacji. Cofnięcie kodu nie przywraca usuniętych danych przeglądarki — do tego służy wyeksportowana kopia JSON.

## Architektura zastana

Statyczne HTML + CSS + dwa klasyczne skrypty, bez bundlera i zależności produkcyjnych. `index-app.js` łączy katalog, import, rendering kart i dialogi. `viewer-app.js` łączy drzewo, edycję, odczyt parametrów i kilka powielonych ścieżek zapisu. Dane katalogu znajdują się w `ppv.projects`; projekt jest tekstem JSON w `inlineData`. Sekcje mają `title`, `icon`, `items`; grupy mają `text`, `children`; liście `text`, `link`, opcjonalnie `fblock`. Rodzaj bloku jest wywodzony z nazwy. Węzły nie mają ID.

Dotychczasowe `menuData`, `pageTitle`, `pageEdited`, `activePdf` były globalne dla całej domeny. SessionStorage przekazywało projekt do viewera; dodatkowo backlink przenosił pełny projekt jako `inline64` w adresie. To tworzyło kilka konkurencyjnych źródeł danych. Nie znaleziono testów, konfiguracji npm ani CI. README deklarowało przypinanie projektów, ale aktualny kod nie zapewnia tej funkcji; odwołanie do przycisku eksportu statycznego również nie stanowi jego implementacji.

## Ustalenia i poprawki

| Ryzyko                         | Problem w kodzie bazowym                                                                          | Zmiana                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Krytyczne: integralność        | Brak dopasowania PID/sluga kończył się zapisem do pierwszego projektu; dopasowywano też po tytule | Aktualizacja wyłącznie po ID; brak/usunięcie projektu kończy się komunikatem, bez podmiany innych danych                                           |
| Wysokie: integralność          | Wiele projektów współdzieliło globalne menu i tytuł                                               | Roboczy stan viewera w pamięci jego karty; katalog pozostaje źródłem projektu; sesyjny stan podglądu oddzielony po ID                              |
| Wysokie: XSS                   | Tytuł karty i HTML ikony/tytułu sekcji trafiały do innerHTML                                      | Escaping pól karty, sekcje przez textContent/createTextNode, ikony z kontrolowanej listy                                                           |
| Wysokie: import                | Syntaktycznie poprawny JSON traktowano jako poprawny projekt; podmiana nie miała walidacji        | Wspólny walidator struktury, typów, ID, slugów, adresów, głębokości i liczby węzłów przed zapisem                                                  |
| Wysokie: zapis                 | Błędy zapisu ignorowano, pokazywano sukces                                                        | Komunikat błędu, zachowanie poprzedniego trwałego zapisu, ostrzeżenie przed zamknięciem niezapisanego viewera i możliwość eksportu bieżącego stanu |
| Wysokie: konflikt              | Starsza karta mogła nadpisać nowszą                                                               | Porównanie wersji rekordu przed zapisem viewera; kontrola nieaktualnej listy w katalogu                                                            |
| Wysokie: routing               | Backlink inline64 mógł nadpisać pierwszy projekt i ujawniał dane w historii URL                   | Usunięto generowanie i przyjmowanie tego mechanizmu; powrót do katalogu zwykłym linkiem                                                            |
| Wysokie: dokumenty             | Dowolny schemat URL przekazywany do iframe                                                        | HTTP(S)/ścieżki względne; odrzucenie javascript/data/file, danych logowania, znaków kontrolnych i backslashy; sandbox dokumentów bez skryptów      |
| Średnie: tożsamość             | Duplikat zachowywał slug oraz stary tytuł wewnątrz JSON                                           | Nowe ID, usunięcie odziedziczonego sluga, nowy tytuł również w payloadzie                                                                          |
| Średnie: grupy                 | Tekstowa ścieżka `>` była niejednoznaczna                                                         | Cel dodawania wskazuje konkretną tablicę węzłów; nazwy grup mogą zawierać separator                                                                |
| Średnie: destrukcyjne operacje | Reset/usuwanie drzewa i podmiana katalogu bez potwierdzenia                                       | Potwierdzenia przed wykonaniem                                                                                                                     |
| Średnie: linki                 | Kopiowany slug nie zawsze był zapisany; 404 z końcowym ukośnikiem prowadziło w złe miejsce        | Link po PID; zachowany odczyt starych slugów; poprawiona ścieżka przekierowania                                                                    |
| Średnie: mały ekran            | Brak viewport viewera i stała szerokość menu ograniczały dokument                                 | Viewport, układ pionowy na wąskim ekranie, ograniczenie wysokości drzewa, responsywne dialogi                                                      |

Pozostałe innerHTML tworzą statyczne kontrolki albo czyszczą kontenery. Opis projektu jest traktowany jako tekst. Importowane pole `icon` pozostaje w danych dla kompatybilności, ale nie jest wykonywane. Zaufana lokalna instrukcja `default.html` zachowuje skrypty i zmianę języka; zewnętrzne dokumenty ich nie otrzymują. Parametry `pid` i `slug` nie zapisują danych z samego URL.

## Kompatybilność i granice

Nie przeprowadzono migracji schematu ani IndexedDB. Eksport nadal używa starego formatu; obsługiwany jest projekt `{title,date,menuData}` oraz historyczna tablica sekcji. Zachowano katalog `projects.json` z tekstowym `inlineData`. Stary globalny projekt można odczytać w samodzielnym viewerze bez PID; jego dalsze zmiany są kopią roboczą karty w sessionStorage i wymagają eksportu do przeniesienia. Projekty otwarte z katalogu zapisują się do ich rekordów.

Import lokalny: niepusty JSON do 8 MiB, do 2000 projektów w katalogu, 100 sekcji/projekt, 20 000 węzłów/projekt, głębokość do 32. Zwykłe spacje w ścieżkach PDF pozostają obsługiwane. Pliki z niepoprawnymi/zdublowanymi ID lub slugami są odrzucane zamiast automatycznie naprawiane. Nie kasujemy niepoprawnego surowego katalogu podczas startu. Katalog zaimportowany jako zamiana zastępuje całość po potwierdzeniu: przedtem trzeba zrobić eksport.

`localStorage` nie zapewnia transakcyjnego compare-and-swap. Kontrola wersji obsługuje zwykły scenariusz starszej karty, ale nie daje formalnej gwarancji dla równoczesnych zapisów z różnych procesów przeglądarki między odczytem i zapisem. To istotne ograniczenie tej fazy. Docelowe rozwiązanie to transakcje IndexedDB, a nie rozbudowywanie tego mechanizmu. Pełny katalog nadal zapisywany jest synchronicznie — duże projekty mogą blokować interfejs i przekroczyć limit przeglądarki poniżej limitu importu. Kopia zapasowa nadal jest ręcznym eksportem JSON.

PDF zależy od przeglądarki oraz nagłówków serwera dokumentu (CSP/X-Frame-Options, mixed content). Sandbox może ograniczać funkcje wbudowanego czytnika; wymaga ręcznej kontroli w docelowych Edge/Chrome/Firefox. JSON przechowuje linki, nie bajty PDF. Nie zapewnia pełnego offline dla dokumentów zdalnych. Brak ZIP, lokalnych załączników, wyszukiwania PDF, SCL/AST ani analizy zależności. UI nadal jest głównie angielski; globalne PL/EN i nowy design należą do etapu 3. Nie deklarujemy wydajności dla dużych rzeczywistych projektów bez benchmarków.

## Weryfikacja

- `npm test`: 8 testów jednostkowych/integracyjnych — przechodzą. Walidacja starych formatów, błędne/puste/duże dane, głębokie drzewo, polityka URL, zdublowane ID, escaping, przekroczenie quota, starszy zapis katalogu, aktualizacja po ID i brak nadpisania innego projektu.
- `npm run build`: przechodzi. To kontrola składni trzech skryptów; aplikacja nie wymaga kompilacji i nie generuje `dist`.
- `npm run test:e2e`: 5 scenariuszy Chromium — przechodzą. Tworzenie szablonu, grupy/bloku, edycja, eksport, reload, dwie karty/różne projekty, konflikt tego samego projektu, nieznane ID, XSS, błędny import, duplikacja, opis, usuwanie, eksport/import katalogu, wąski ekran i instrukcja; dodatkowo uszkodzony katalog, zachowanie pustej listy i symulacja quota w UI.
- GitHub Actions uruchamia te same kontrole dla PR i brancha modernizacji. Nie wdraża ani nie scala zmian.
- E2E korzysta wyłącznie z syntetycznych projektów. Nie pobrano ani nie opublikowano projektów przemysłowych użytkownika.

Nie wykonano pełnej macierzy przeglądarek, testu faktycznego interfejsu drukowania/PDF ani benchmarku dużego TIA. Kryterium działania na publicznym GitHub Pages wymaga kontroli po zaakceptowanym wdrożeniu; produkcyjne demo nie zostało zmienione. PR należy sprawdzić przed merge.

## Kolejność dalszych prac

1. Zatwierdzić stabilizację po CI i ręcznej kontroli dokumentów PDF w używanej przeglądarce. Dodać brakujące testy rzeczywistych formatów eksportu użytkownika na zanonimizowanych plikach.
2. Etap 2: osobny model domenowy, UUID węzłów, jawny blockType, wersjonowany eksport. Adaptery starego formatu i testy migracji przed zmianą magazynu. IndexedDB z transakcjami, kontrolą rewizji, załącznikami Blob i bezpieczną migracją, która nie usuwa localStorage przed potwierdzeniem zapisu i walidacją odczytu.
3. Dopiero potem rozważyć Vite + TypeScript. Uzasadnienie: wielomodułowy model dokumentów i importer TIA. Migracja stopniowa; nie jest potrzebna do obecnych napraw bezpieczeństwa.
4. Etap 3: polski domyślny, pełne PL/EN, katalog + drzewo + zakładki, stabilne identyfikatory nawigacji, motywy, skróty, dostępność i testy klawiatury.
5. Etap 4: przenośny ZIP z manifestem i lokalnymi dokumentami, wiele załączników na blok, PDF.js dopiero z uzasadnieniem i pomiarem kosztu. Testować brakujące pliki, limity i ZIP bomb.
6. Etap 5: najpierw kontrakt eksportera jednego PLC z TIA (wersja TIA, zakres eksportu, hierarchia, GUID/ścieżki, języki). Następnie gramatyka SCL i korpus testowy. Brak heurystycznej analizy przedstawianej jako parser.

Wdrożenie roadmapy wymaga osobnych PR. Obecna zmiana nie oznacza zakończenia etapów 2–6 ani certyfikacji aplikacji do dokumentacji przemysłowej.
