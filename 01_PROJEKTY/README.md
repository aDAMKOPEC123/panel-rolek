# 01_PROJEKTY
Jedna rolka = jeden folder. Nazwa: `RRRR-MM-DD_kategoria_temat-krotko`, np. `2026-11-12_brwi_laminacja-ile-trzyma`.
Kategorie: brwi, rzesy, twarz, podologia, pedicure, gabinet, edukacja.

- Nowa rolka: `npm run nowa-rolka -- <kategoria> "temat"` (kopiuje `_SZABLON_ROLKI`).
- Co jest w środku: `_SZABLON_ROLKI/README.md` i README w każdym podfolderze.
- Po publikacji: `npm run archiwizuj -- <projekt>` przenosi folder do 05_ARCHIWUM.
- NIE twórz folderów ręcznie z inną nazwą (skrypty szukają po tym schemacie). NIE edytuj `_SZABLON_ROLKI`, chyba że chcesz zmienić szablon dla wszystkich nowych rolek.
