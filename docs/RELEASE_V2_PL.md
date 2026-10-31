# PLC Viewer v2 — raport modernizacji

Data: 31 października 2026. Branch: `develop/plc-viewer-modernization`. PR: [#1](https://github.com/tentypcic/plc_program_viewer_cms/pull/1).

## Wynik

Rozwinięto istniejące repozytorium. Dane wcześniejszego viewera mają automatyczną migrację; nie utworzono osobnej, odłączonej aplikacji. Główne problemy wyjściowe — zapis do pierwszego projektu, globalne menu różnych projektów, XSS z tytułów/ikon, niekontrolowany import i ignorowanie błędów zapisu — zastąpiono jawnym modelem i transakcyjnym repozytorium.

| Etap specyfikacji | Dostarczony zakres                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Stabilizacja   | Walidacja, bezpieczny DOM, kontrola adresów, konflikty i rollback, potwierdzenia, odzyskiwanie niezapisanych zmian                              |
| 2. Architektura   | TypeScript, Vite, UUID, jawne typy, IndexedDB, wersjonowany JSON, zgodność starszego importu, historia i ZIP                                    |
| 3. UI/UX          | Katalog, przypinanie, kosz, drzewo z wirtualizacją, zakładki, wyszukiwanie, szerokość panelu, menu kontekstowe, PL/EN, motywy, dialogi i skróty |
| 4. Dokumentacja   | PDF.js z nawigacją i zoomem, lokalne PDF, wiele dokumentów, indeks tekstu, źródła tekstowe/SCL, notatki i diagnostyka                           |
| 5. Rozwój PLC     | Kontrakty analizatora/importera TIA, leksykalne kolorowanie, porównanie tekstu i modelu; bez pozornego AST                                      |
| 6. Jakość         | Testy jednostkowe/integracyjne i Chromium, TypeScript/build, audyt zależności, CI, artefakt statyczny i workflow Pages                          |

Zwijanie składni, lista deklaracji, semantyczne referencje i mapa zależności nie są aktywnymi funkcjami tej wersji. Zgodnie z pierwotnym zakresem etapu 5 przygotowano architekturę pod te funkcje; wymagają właściwego analizatora i korpusu eksportów. Nie ma bezpośredniego importu natywnych projektów TIA. Nie deklarujemy też semantycznego porównania kodu.

## Kopie i punkty przywracania

- Stan sprzed modernizacji: `ffd7fb905e6686ea595cfa8dcfc6fb3c1ff21934`.
- Stan po stabilizacji: branch `backup/plc-viewer-before-v2`, commit `c941bbdb3216f0fc51bc08a3fab67f94ad5a3388`.
- Stan modelu i repozytorium: branch `backup/plc-viewer-model-v2`.
- Gotowy interfejs i dokumenty: branch `backup/plc-viewer-v2-ui`.
- Kompletna wersja do oceny: branch `backup/plc-viewer-v2-complete`.

Dane użytkownika: oryginalny localStorage pozostaje, migracja przechowuje dodatkową surową kopię, każdy zapis zachowuje do 20 wcześniejszych rewizji. Kopia ZIP przenosi bieżące projekty i ich dokumenty poza przeglądarkę. Repozytorium nie zawiera danych użytkownika odczytanych z jego przeglądarki.

## Weryfikacja

Końcowa seria obejmuje 22 testy jednostkowe/integracyjne oraz 11 scenariuszy Chromium, TypeScript i produkcyjny build. Szczegółowe wyniki są w GitHub Actions; workflow ponawia je na każdym commicie PR.

Sprawdzane przypadki: migracja i jej równoległe wywołania, zachowanie oryginalnego JSON i daty, błędny schemat, quota-style rollback, brakujące i obce pliki, cykle i rodzice drzewa, kopiowanie ID, ZIP roundtrip, traversal i nieznane wpisy, historia 20 wersji i sprzątanie Blobów, kosz, UTF-8/UTF-16, XSS/URL, tworzenie/edycja/reset/usuwanie i odświeżenie, izolacja projektów, konflikty kart i kopia robocza, tekst/SCL, rzeczywiste renderowanie PDF, indeksowanie i ZIP PDF po indeksacji, zakładki, PL/EN, motyw, klawiatura oraz ekran 390 px oraz stare slugi i nieprawidłowe zagnieżdżone adresy Pages.

Test syntetycznego projektu z 12 000 bloków potwierdza ograniczoną liczbę wierszy DOM i znalezienie elementu spoza widocznego okna. To nie jest benchmark wszystkich maksymalnych rozmiarów dokumentacji przemysłowej.

Audyt npm wykrył podatności wcześniejszych wersji `fflate`, `diff` i deweloperskiego Vite. Zaktualizowano je do poprawionych wersji, a CI uruchamia audyt z progiem moderate. Czytnik PDF jest oddzielnym, leniwie ładowanym modułem z workerem; wyłączono eval podczas odczytu dokumentów. Zrzuty kontrolne katalogu i przestrzeni dokumentów zostały obejrzane podczas weryfikacji układu.

## Publikacja i ograniczenia

`main` i publiczne demo nie zostały zmienione ani scalone. PR zawiera gotowe źródła i konfigurację. CI udostępnia gotowy artefakt `plc-viewer-pages`, a workflow Pages buduje i publikuje dopiero po zaakceptowanym pushu do main. Ustawienie źródła Pages na **GitHub Actions** jest wymagane przy przejściu z dawnego hostingu plików z brancha. Wdrożenia produkcyjnego i jego odbioru nie należy uznawać za wykonane przed akceptacją.

Pozostałe ograniczenia: zasoby przeglądarki, RAM przy dużym ZIP, CORS dla zdalnych dokumentów, brak OCR i Service Workera, normalizacja plików tekstowych do UTF-8, brak pełnej macierzy przeglądarek. Lokalna historia nie zastępuje zewnętrznego ZIP. Porównania po UUID są najbardziej wiarygodne dla kolejnych wersji tego samego projektu v2.

Dalsze prace powinny dotyczyć odbioru z zanonimizowanym rzeczywistym eksportem użytkownika, gramatyki SCL i eksportera jednego PLC z Windows/TIA Openness, a następnie dodatkowych przeglądarek i wydajności bardzo dużych paczek. [Szczegóły architektury](ARCHITECTURE_PL.md).
