# Schemat i przenośny format v2

JSON ma postać `{format:"plc-viewer",schemaVersion:2,exportedAt:<ISO>,projects:[...]}`. Nieznana wersja jest odrzucana. Źródłem kontraktu i walidacji jest `app/model.ts`; import historyczny znajduje się w `app/legacy.ts`.

| Obiekt  | Najważniejsze pola                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Project | id UUID, name, description, createdAt, updatedAt, revision, pinned, nodes, documents; opcjonalnie legacyId, slug, deletedAt |
| Node    | id UUID, parentId UUID/null, kind group/block, name, description, blockType, safety, notes, alarmCode, remedy, sequence     |
| Doc     | id UUID, nodeId UUID, name, mime, size; opcjonalnie url i text                                                              |

`blockType`: OB, FB, FC, DB, UDT, TAGS, OTHER. Rodzic musi istnieć i być grupą. Zabronione są cykle, osierocone dokumenty i zdublowane UUID wewnątrz importowanej paczki. Nazwa i tekst to dane, nie HTML. Typy dat, rewizji i flag są walidowane.

Dokument PDF z URL używa `url`. Lokalny PDF jest Blobem w IndexedDB, pod identyfikatorem dokumentu; opcjonalne `text` jest wyłącznie zindeksowaną warstwą wyszukiwania i nie zastępuje bajtów PDF. Dokument tekstowy przechowuje Unicode w `text`. Po imporcie UTF-16 pobrany tekst jest normalizowany do UTF-8; nazwa pliku pozostaje zachowana.

ZIP zawiera:

- `manifest.json` — powyższy JSON;
- `documents/<UUID>` — bajty każdego lokalnego PDF (lub dokumentu bez inline text).

Nazwy plików z katalogu centralnego ZIP nie są używane jako ścieżki systemu plików. Import dopuszcza wyłącznie manifest i wpisy dokumentów o UUID, odrzuca nieznane wpisy, traversal, brakujące lub niezgodne rozmiary oraz paczki przekraczające limity. Kody ZIP nie są wykonywane. Załącznik nie może nadpisać pliku należącego do innego projektu.

Limity: 100 MiB wejścia, 250 MiB deklarowanej treści ZIP, maks. 20 001 wpisów ZIP, pojedynczy dokument 50 MiB, projekt do 20 000 węzłów i 20 000 dokumentów. Z powodu limitu liczby wpisów eksport bardzo dużej kolekcji lokalnych PDF należy dzielić na projekty. Historia rewizji i surowy legacy backup są lokalnymi mechanizmami odzyskiwania, nie częścią manifestu v2.

Przy imporcie jako kopia zmieniane są wszystkie UUID i referencje, a Blob jest przypisywany nowemu dokumentowi i projektowi. Przy zastępowaniu rewizja wejściowa nie daje prawa do nadpisania nowszego zapisu — repozytorium sprawdza faktyczną aktualną rewizję w transakcji.
