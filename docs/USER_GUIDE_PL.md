# Instrukcja użytkownika

## Pierwsze uruchomienie

1. Pobierz `projects.json` w dotychczasowej aplikacji i zachowaj go poza przeglądarką.
2. Otwórz nową wersję na tym samym adresie i w tym samym profilu przeglądarki. Migracja lokalnych danych przebiega automatycznie i nie usuwa starego zapisu.
3. Jeśli pracujesz pod innym adresem, użyj Importuj i wybierz stary JSON. Pamięć przeglądarki jest rozdzielona według origin; localhost i GitHub Pages mają osobne biblioteki.
4. Utwórz próbny projekt i sprawdź ZIP na drugiej przeglądarce, zanim użyjesz aplikacji do istotnej dokumentacji.

Pomoc (`?`) zawiera również pobieranie surowej kopii danych sprzed migracji i wczytanie syntetycznego przykładu. Nie publikuje to Twoich projektów w repozytorium.

## Organizowanie programu

Katalog pozwala utworzyć projekt, zmienić nazwę i opis, przypiąć go lub skopiować. Menu `•••` i prawy przycisk myszy udostępniają operacje. Kopia otrzymuje nowe UUID dla wszystkich węzłów i dokumentów oraz własne lokalne pliki.

Po otwarciu projektu domyślnie działa tryb odczytu. Włącz tryb edycji, aby dodawać grupy i bloki, zmieniać typy, opisy i lokalizację w drzewie. Wybierz lokalizację w formularzu edycji, aby przenieść element. Grupa nie może być rodzicem samej siebie ani własnego potomka. Nazwy nie muszą być unikalne; tożsamość zapewnia UUID.

Typ bloku wybierasz jawnie. Zmiana nazwy `Main` na `Main [OB1]` nie zmienia typu automatycznie. Starszy importer rozpoznaje dotychczasowe oznaczenia nazw i zapisuje wynik w nowym polu.

## Dokumenty i diagnostyka

Wybierz blok lub grupę, a w trybie edycji dodaj lokalne pliki, link PDF albo tekst. Jeden węzeł może mieć wiele dokumentów. Kliknięcie dokumentu otwiera zakładkę. Panel drzewa można przeciągać lub zmieniać strzałkami po ustawieniu fokusu na separatorze.

PDF.js wyświetla lokalne pliki bez iframe. Możesz zmienić stronę i powiększenie. **Indeksuj treść PDF** dodaje tekstową warstwę dokumentu do wyszukiwarki; skany bez warstwy tekstowej wymagają zewnętrznego OCR. Zdalny serwer może blokować pobieranie PDF przez CORS. Wtedy otwórz oryginalny dokument lub dodaj plik lokalnie.

Źródła SCL/ST mają kolorowanie składni, ale aplikacja nie wykonuje programu, nie potwierdza jego poprawności i nie zapewnia analizy bezpieczeństwa PLC. Inne teksty oraz źródła dłuższe niż 150 000 znaków są wyświetlane jako zwykły tekst, aby ograniczyć koszt renderowania. Pliki tekstowe muszą mieć UTF-8 lub UTF-16 z BOM; nieprawidłowe bajty są odrzucane, zamiast zamieniane po cichu na `�`.

W edycji węzła uzupełnij notatki, kod alarmu, instrukcję działania i warunki sekwencji. Te pola są przeszukiwane i przenoszone w eksporcie v2.

## Wyszukiwanie i porównania

Ctrl/Cmd+K ustawia fokus na globalnym wyszukiwaniu. Wyniki obejmują nazwy projektów i bloków, opisy, notatki, źródła oraz zindeksowane PDF. Lista pokazuje maksymalnie 100 wyników — zawęź zapytanie, jeżeli jest ich więcej.

Porównanie projektu jest dostępne w menu viewera i historii. Opiera się na stabilnych UUID. Nowo wygenerowane identyfikatory ze starszego eksportu mogą być pokazane jako usunięte/dodane elementy, zamiast jako zmiana nazwy. Porównanie tekstu pokazuje różnice linii; nie porównuje semantyki SCL. Koszt porównania jest ograniczony czasem i liczbą edycji.

Ctrl/Cmd+S pobiera JSON aktualnego projektu; dane lokalne są zapisywane transakcyjnie przy zatwierdzaniu formularzy. Escape zamyka dialog lub menu. Strzałki i Enter obsługują drzewo. Motyw i PL/EN są dostępne na lewym pasku.

## Kopie i przywracanie

- **Kopia ZIP** w katalogu: bieżące stany wszystkich projektów, również znajdujących się w koszu, wraz z lokalnymi PDF i treścią dokumentów tekstowych. Nie zawiera całej lokalnej historii 20 rewizji.
- **Eksport ZIP** projektu: jeden kompletny bieżący projekt. Dokumenty z URL pozostają URL.
- **Eksport JSON**: wersjonowana struktura, metadane i tekst. Lokalne PDF wymagają osobnego ZIP; świeża przeglądarka odrzuci import z brakującymi załącznikami.
- **Eksport starszego JSON**: zgodność z dawnym viewerem dla projektów mających wyłącznie linki PDF i bloki w grupach. Stary format nie przenosi nowych pól ani wielu dokumentów na blok; do pełnej kopii użyj ZIP.
- **Historia i przywracanie**: do 20 wcześniejszych wersji przed każdą zmianą. Przywrócenie tworzy nową rewizję i zachowuje dotychczasową. Pliki są utrzymywane tak długo, jak odwołuje się do nich bieżący projekt lub historia.

Domyślny import dodaje projekty jako nowe i przepisuje UUID. Opcja zastąpienia aktualizuje tylko projekty o tych samych ID; pozostałe projekty zostają. Import jest jedną transakcją, więc błąd jednego projektu odrzuca całą paczkę.

Usuwanie projektu przenosi go do kosza. Trwałe usunięcie lub opróżnienie kosza wymaga potwierdzenia i usuwa również załączniki oraz historię. Usuwanie elementów drzewa i reset struktury można cofnąć poprzez historię projektu.

## Konflikt lub błąd zapisu

Nie zamykaj karty. Pobierz **niezapisane zmiany** jako ZIP, a następnie odśwież projekt. Inne operacje są blokowane do rozstrzygnięcia błędu. Ostrzeżenie przed zamknięciem chroni niezatwierdzoną kopię roboczą, ale nie gwarantuje jej przetrwania po awarii systemu.

Konflikt rewizji oznacza, że inna karta zapisała nowszą wersję. Starsza karta jej nie nadpisuje. Błąd limitu miejsca również nie usuwa wcześniejszego zapisu. Pobierz ZIP istniejących danych, zwolnij miejsce w koszu lub usuń niepotrzebne dane innych witryn i spróbuj ponownie.

Jeśli migracja odrzuci uszkodzony katalog, zachowaj surowy JSON z ekranu odzyskiwania. Aplikacja nie nadpisuje go pustym projektem ani nie ustawia znacznika udanej migracji. Przyczyna wymaga naprawienia kopii JSON lub przywrócenia prawidłowego eksportu; nie czyść danych przeglądarki przed pobraniem kopii.

## Udostępnianie

Kopiowany link wskazuje projekt lokalnie po UUID. Sam link nie przesyła projektu drugiej osobie. Aby udostępnić dokumentację, przekaż wyeksportowany ZIP bezpiecznym kanałem, a odbiorca zaimportuje go do swojej przeglądarki. Nie umieszczaj poufnych projektów automatyki w publicznym repozytorium ani przykładowych danych aplikacji.

