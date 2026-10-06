# Architecture notes

## Goals

OneShot implements its own capabilities locally (clipboard, OCR, display control, battery charge limits, screenshot / recording, infinite canvas, JSON workbench, local password vault). It does not shell out to third-party apps for those flows.

## Layering

| Layer | Surfaces | Lifetime |
| --- | --- | --- |
| Menu bar | Battery, Displays, Screenshot entry | Always available glance |
| Runtime floats | Clipboard, Format, Autofill | Summon near cursor / field, then dismiss |
| Transient editor | Capture annotate / OCR / record | Close when done |
| Workspaces | Canvas, JSON Studio, Vault | Separate windows |

## Design constraints

- Near-pure white backgrounds; avoid paper tint, heavy gray borders, nested dirty panels.
- Prefer icons, then icon + short label, then text-only as a last resort.
- Breathing room and motion used as adhesives / transitions, not decoration noise.
- No placeholder / guide / review chrome in shipping UI copy.
- English-first UI chrome; bilingual support is a product goal for later.

## Prototype layout

- `prototype/prototype.html` — single-file interactive desk (built).
- `prototype/src/` — `c-body.html`, `a-css.css`, `d-js.js`, `b-icons.svg`, `build.py`.
- `docs/screenshots/` — English UI captures for review.
