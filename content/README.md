# Page copy

Every page's words live here, one file per page (same format as dnsmailcheck's content/: front matter, a small Markdown subset, `{{...}}` blocks from code). Edit a file, run `npm run build` (or deploy, which builds first), and the page changes.

| File | Page |
|---|---|
| `index.md` | `/` (home: the calculator tiles, `{{explore}}`) |
| `voltage-drop-calculator.md`, ... | the calculator page with the same name |
| `ampacity-chart.md` | `/ampacity-chart` |
| `privacy.md`, `terms.md` | `/privacy`, `/terms` (`layout: prose`) |
| `404.md` | the "page not found" page |

Which file belongs to which address, and which blocks a page has, is set in `src/site/pages.ts`.

## Blocks from code (each on a line of its own)

- `{{calculator}}` (and `{{calculator2}}`): the page's calculator, from `src/site/calculators.ts`, with the default result already shown.
- `{{formula}}`: the formula in MathML with what each symbol means.
- `{{example}}`: the worked example, computed from `src/lib/calc.ts` at build time.
- `{{chart}}`, `{{chart2}}`: reference charts, computed from `src/lib/calc.ts` (our own layout; tables cited by number).
- `{{explore}}`: the home page's tiles.
- `{{links /a /b}}`: a grid of links.

Inside a sentence: `{{brand}}`, `{{supportEmail}}`, `{{editions}}` ("Same in NEC 2017, 2020, 2023 and 2026."), `{{ahj}}` (the verify line).

Formatting, `summary:` cards, `{.lead}` / `{.notice}` classes and `{{#if adsEnabled}}` work as in dnsmailcheck's content/README.md. Characters like `<` are shown as typed: you can't put HTML in a file.
