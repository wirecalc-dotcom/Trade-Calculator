# wirecalculators.com — Trade Calculator

Free, accurate electrical calculators for working electricians. Built as a clone of **dnsmailcheck** (repo `clutcharchive2006-glitch/email-checker`): same stack, same web-analytics matrix, same click tracking, same UI — rebranded, with every dnsmailcheck product feature removed.

## Read first
- `docs/dnsmailcheck-setup.md` — how dnsmailcheck is built (written in build step 1). The source of truth for infra, analytics, tracking and UI.
- `docs/research/calculator-math-research.md` — formulas, NEC tables, legal rules, build decisions.
- `docs/research/calc_reference.py` — reference math + sourced test cases. Site math must reproduce these outputs.
- `docs/plan.md` — phases, MVP scope, decision rules.

## Hard rules
1. **Accuracy is the product.** Every calculator's JS is tested against `calc_reference.py` cases. Never ship a formula change without a passing test.
2. **Compute from raw table values** (Ch. 9 Tables 4/5/8/9, Table 310.16). Never use pre-rounded columns (e.g. Table 9 "Effective Z at 0.85 PF").
3. **Conduit fill applies Ch. 9 Note 7** (round up at ≥ 0.8). **Wire size enforces 240.4(D) and 110.14(C).**
4. **No paid features** (no Watch/Managed/accounts/checkout) until Phase 2 or Phase 4 passes. dnsmailcheck's paid features are not ported.
5. **NEC tables:** use values inside calculators and cite by table number. Do not reproduce whole NFPA tables in NFPA's layout, titles or footnotes. Never put "NEC" in brand names.
6. Same Cloudflare/GitHub/email account set as dnsmailcheck (the stackbrief.co login). Secrets by name only; never commit values.
7. Mobile-first, fast, no login. Show the formula and code reference on every calculator page.

## Working style (Colin)
Brief plain-language reports, ranked recommendations, no narration. Write important findings into `docs/` so new chats start cheap.
