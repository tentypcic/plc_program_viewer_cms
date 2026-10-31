# Architektura aplikacji

## Warstwy

| Moduł                            | Odpowiedzialność                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| app/model.ts                     | Typy domenowe, walidacja v2, UUID, kopiowanie i operacje na drzewie, indeks wyszukiwania |
| app/legacy.ts                    | Adapter wcześniejszych JSON i eksport starszego formatu                                  |
| app/db.ts                        | IndexedDB, transakcje i rewizje, migracja, historia, Blob, kosz                          |
| app/archive.ts                   | Przenośne ZIP/JSON, limity i remapowanie tożsamości                                      |
| app/main.ts                      | Kontroler UI, stan aktualnego projektu po ID, formularze i widoki                        |
| app/dom.ts / i18n.ts / style.css | Bezpieczne elementy DOM, PL/EN, motywy i responsywny układ                               |
| app/pdf.ts                       | Leniwie ładowany PDF.js i jego worker, renderowanie, indeks tekstu                       |
| app/text.ts                      | Jawne dekodowanie UTF-8 i UTF-16 z BOM bez cichej podmiany bajtów                        |
| app/analysis                     | Kontrakty przyszłej analizy, leksykalne kolorowanie i rzeczywiste porównanie wersji      |

Nie ma backendu, API kont ani serwera synchronizującego dokumentację. Vite służy do lokalnego tworzenia i budowania statycznych plików. TypeScript sprawdza kontrakty; walidacja runtime nadal jest wymagana dla danych importowanych.

## Zapis i konflikty

Obiekty projektu są klonowane przed zmianą. UI nie traktuje zmienionego formularza jako trwałego zapisu. Repozytorium rozpoczyna transakcję `readwrite` obejmującą projekty, pliki, historię i metadane, sprawdza rewizję i dopiero wtedy zapisuje nowy stan. Przy konflikcie, błędzie pliku lub quota transakcja się wycofuje. Powodzenie jest zgłaszane po `transaction.oncomplete`.

Dwie karty z rewizją 4 nie mogą obie zatwierdzić rewizji 5: druga transakcja odczyta nowszy stan i odrzuci zapis. BroadcastChannel służy wyłącznie do powiadomienia UI; nie jest mechanizmem zapewniającym integralność.

Historia zachowuje 20 poprzednich stanów. Blobów nie usuwa się przy usuwaniu dokumentu, dopóki odwołuje się do nich zachowana rewizja. Niepotrzebne bloby są sprzątane w tej samej transakcji. Opróżnienie kosza jest jedną transakcją i usuwa rekordy, historię i pliki tylko potwierdzonych projektów w koszu.

## Migracja

1. Odczyt starego katalogu albo samodzielnego menu, bez jego zmiany.
2. Parsowanie i pełna walidacja wszystkich projektów.
3. Wygenerowanie UUID i jawnych typów, zachowanie legacyId i slugów.
4. Jedna transakcja zapisująca projekty, surową kopię źródła i znacznik migracji.
5. Dopiero udany commit oznacza zakończenie; stary localStorage nadal pozostaje.

Powtórna i jednoczesna migracja z kilku kart sprawdza znacznik wewnątrz transakcji. Nie duplikuje projektów. Nieprawidłowe źródło kończy się ekranem odzyskiwania. Oryginalny znacznik czasu edycji projektu jest zachowywany przy pierwszym zapisie.

## Wydajność i prywatność

Drzewo jest spłaszczane według rozwiniętych gałęzi, a DOM otrzymuje wyłącznie okno widocznych wierszy z zapasem. Indeks tekstowy jest przygotowywany po rewizji, z jednorazowym grupowaniem dokumentów po nodeId. Zapytania są opóźniane o 140 ms; lista wyników jest ograniczona do 100 pozycji. Dłuższe źródła są pokazywane bez spanów kolorowania. Porównanie linii ma limit czasu i długości edycji.

PDF.js i worker są osobnymi, leniwie ładowanymi plikami. Treść projektu nigdy nie jest interpolowana do HTML. CSP ogranicza wykonywanie skryptów do zasobów aplikacji. Pobieranie zdalnych PDF następuje po wybraniu dokumentu lub indeksowania, a nie podczas tworzenia ZIP. Żadne telemetryczne ani zewnętrzne analityczne usługi nie są dołączone.

Kopie ZIP są przetwarzane lokalnie, z limitami wielkości, liczby i nazw wpisów. Bardzo duże paczki nadal mogą chwilowo zajmować wątek UI i kilka kopii danych w RAM. Gwarancji dla wszystkich maksymalnych limitów na urządzeniach o małej pamięci nie deklarujemy.

## Rozwój analizy PLC

`analysis/contracts.ts` definiuje osobno:

- `PlcAnalyzer`: język/wersja, diagnostyka, zakresy źródłowe, deklaracje, referencje i zakresy zwijania;
- `TiaImportAdapter`: wersja źródła, rozpoznanie plików i konwersja do modelu projektu z raportem diagnostycznym.

Bieżący `lexer.ts` wyłącznie koloruje tokeny; nie implementuje AST ani wywołań bloków. `compare.ts` porównuje rzeczywiste wersje modelu po UUID. Porównanie tekstu jest oparte na liniach, nie na domniemanej równoważności działania PLC.

Kolejny analizator wymaga gramatyki SCL (wariant i wersja Siemens), testów komentarzy, stringów, deklaracji, bloków zagnieżdżonych, błędnego kodu i korpusu zanonimizowanych eksportów. Dopiero wtedy należy uruchomić listę zmiennych, odwołania, mapę OB/FB/FC/DB i zwijanie IF/CASE/FOR/WHILE/REGION/VAR. Żaden z tych wyników nie może być pozornym efektem wyszukiwania słów w kodzie.

## Import jednego PLC z TIA Portal — granica integracji

Przeglądarka nie uruchamia TIA Openness i nie odczytuje natywnych archiwów `.ap20`/`.zap20`. Docelowy eksporter musi działać na Windows przy zgodnej wersji TIA. Powinien:

1. Otworzyć projekt TIA i pozwolić wskazać dokładnie jedną instancję PLC.
2. Zachować hierarchię grup programowych, typy i numery bloków, tagi oraz typy danych; jawnie zgłaszać elementy nieeksportowalne i chronione.
3. Zapisać stabilne identyfikatory źródłowe, ścieżkę PLC, wersję eksportera i wersję TIA.
4. Wyeksportować tekstowe źródła tam, gdzie rzeczywiście są dostępne, oraz dokumenty/oryginalny XML bez udawania konwersji LAD/FBD/GRAPH do SCL.
5. Wyprodukować znormalizowany manifest v2 oraz lokalne dokumenty. Generator UUID powinien zachować mapowanie pomiędzy kolejnymi eksportami, aby porównania wersji miały sens.
6. Dołączyć raport liczby elementów, braków i błędów; nie uznawać częściowego eksportu za pełny.

Adapter aplikacji ma być testowany na jawnych, zanonimizowanych próbkach eksportu. Brak próbek z konkretnej wersji TIA jest powodem odłożenia implementacji tej integracji, a nie dodania przycisku, który pozoruje pełny import.
