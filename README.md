# PLC Viewer

Lokalna biblioteka dokumentacji PLC, rozwijająca **PLC Programme Viewer CMS**. Organizuj projekty i bloki, przeglądaj PDF oraz SCL, wyszukuj dokumentację i zachowuj przenośne kopie ZIP.

**Bez backendu, kont i przesyłania projektów na serwer.** Aplikacja działa na statycznym hostingu GitHub Pages. Dane użytkownika zapisuje w IndexedDB w jego przeglądarce.

[Dotychczasowe demo](https://tentypcic.github.io/plc_program_viewer_cms/) · [PR modernizacji](https://github.com/tentypcic/plc_program_viewer_cms/pull/1) · [Raport wersji 2](docs/RELEASE_V2_PL.md)

> Modernizacja pozostaje na branchu `develop/plc-viewer-modernization`. Dopóki PR nie zostanie zaakceptowany i wdrożony, publiczne demo może pokazywać poprzednią wersję.

## Możliwości

- Katalog projektów: tworzenie, edycja nazwy i opisu, przypinanie, kopiowanie, kosz i przywracanie.
- Drzewo grup i podgrup; jawne typy OB / FB / FC / DB / UDT / TAGS / OTHER oraz oznaczenia F.
- Wirtualizacja drzewa, menu kontekstowe, rozwijanie i zwijanie, przenoszenie przez pole lokalizacji.
- Zakładki dokumentów, regulowany panel, zapamiętanie ostatniego projektu i widoku.
- Tryb odczytu / edycji, interfejs PL/EN, motyw jasny i ciemny.
- Wiele lokalnych PDF lub plików tekstowych przy jednym bloku; opisy, notatki, alarmy, działania naprawcze i informacje o sekwencji.
- PDF.js: strony, powiększanie, indeksowanie tekstu do wyszukiwania. Indeks nie jest OCR.
- Podgląd SCL z kolorowaniem leksykalnym, porównanie tekstu oraz porównanie projektów po UUID.
- Globalne wyszukiwanie nazw, opisów, notatek, tekstów źródłowych i zindeksowanych PDF.
- Import historycznych JSON, wersjonowany JSON v2, przenośny ZIP z lokalnymi PDF i tekstami.
- Transakcje, kontrola rewizji, komunikaty o konfliktach między kartami i kopia niezapisanych zmian.
- Do 20 wcześniejszych wersji projektu, automatycznie zachowywanych przed zmianami.

Analizator AST, semantyczne odwołania i mapa zależności, lista deklaracji oraz składniowe zwijanie struktur mają przygotowane kontrakty. **Nie są udawane przez wyrażenia regularne ani prezentowane jako działająca analiza.** Bezpośredni odczyt `.ap*` / `.zap*` z TIA Portal nie jest obsługiwany. Zobacz [architekturę i kontrakt importera](docs/ARCHITECTURE_PL.md).

## Uruchomienie i testy

Wymagany Node.js 22.18+ lub aktualny Node.js 24.

```sh
npm ci
npm run dev
```

Serwer lokalny nasłuchuje na `127.0.0.1`. Aplikację należy otwierać przez HTTP(S), nie przez dwukrotne kliknięcie pliku HTML.

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --audit-level=moderate
```

`npm run build` wykonuje TypeScript i buduje gotowy katalog `dist/`. Testy E2E wymagają wcześniejszego builda i sprawdzają właśnie `dist/` pod prefiksem `/plc_program_viewer_cms/`.

## Migracja i kopie zapasowe

Przed pierwszą aktualizacją pobierz `projects.json` ze starej wersji. Nowa wersja automatycznie odczytuje istniejący katalog `ppv.projects` albo samodzielny projekt `menuData`. Zachowuje oryginalne klucze localStorage, surową kopię w IndexedDB i oryginalne identyfikatory jako `legacyId`. Migracja i jej znacznik są zapisywane w jednej transakcji.

Do regularnych kopii używaj **Kopia ZIP**. Eksport JSON przechowuje strukturę i tekst, ale nie bajty lokalnych PDF. Historia 20 wersji pomaga cofnąć edycję; nie zastępuje pobranej kopii poza przeglądarką. Usunięcie danych witryny usuwa także lokalną historię.

[Instrukcja użytkownika i odzyskiwania](docs/USER_GUIDE_PL.md) · [Schemat danych](docs/SCHEMA_V2_PL.md)

## GitHub Pages

Workflow `quality.yml` uruchamia testy i build dla brancha oraz PR, a następnie udostępnia artefakt `plc-viewer-pages`.

Workflow `pages.yml` buduje i wdraża aplikację **dopiero po pushu do `main`**, czyli po zaakceptowanym scaleniu. W repozytorium należy ustawić **Settings → Pages → Source → GitHub Actions**. Nie wdrażaj surowych plików TypeScript jako strony; publikowany jest katalog `dist/`. Względna baza Vite obsługuje adres repozytorium na GitHub Pages.

## Ograniczenia

- ZIP/JSON do 100 MiB; ZIP maks. 250 MiB po rozpakowaniu. Lokalny PDF do 50 MiB, tekstowy plik do 2 MiB i do 2 mln znaków treści. Obsługiwane UTF-8 oraz UTF-16 z BOM; tekst jest przechowywany i eksportowany jako Unicode/UTF-8.
- Do 2000 projektów w jednym imporcie, do 20 000 węzłów i dokumentów w projekcie, głębokość drzewa do 64. Starszy format: głębokość do 32.
- Limit miejsca zależy od przeglądarki. Nie jest gwarantowane przechowywanie maksymalnego rozmiaru każdego pliku równocześnie.
- Zdalny PDF może wymagać CORS i dostępu do sieci. ZIP zachowuje taki adres, nie pobiera potajemnie zdalnego dokumentu.
- Ładowanie samej aplikacji wymaga hostingu lub lokalnego serwera. Brak Service Workera i gwarancji ponownego otwarcia offline.
- Zweryfikowano Chromium; pełna macierz Edge/Firefox/Safari wymaga osobnego sprawdzenia.

Projekt rozwijany przez [tentypcic](https://github.com/tentypcic). Licencja MIT.
