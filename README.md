# OneShot

Interactive HTML prototype for a macOS-style local utility suite: clipboard, screenshot / OCR, displays, battery, JSON format / studio, password autofill / vault, and infinite canvas.

Primary UI language is **English**. The product is planned to support Chinese and English; this repository ships English chrome first.

## Open the prototype

After cloning, open [`prototype/prototype.html`](prototype/prototype.html) in a modern browser. HTML, CSS, JavaScript, and icons are self-contained. No install or build step is required to view.

Source parts used to rebuild that file live under [`prototype/src/`](prototype/src/). From that folder:

```bash
python3 build.py
```

This regenerates `../prototype.html` (and the sibling `oneshot-runtime-all.html` path used during design).

## Product shape (four layers by dwell time)

Not one mega-window with tabs. Surfaces are separated by how long you stay:

1. **Menu bar** — Battery and Displays for a quick glance; Screenshot entry.
2. **Runtime floats** — Clipboard near the caret; JSON Format hotkey (no window); password Autofill near a login field. Passwords must never enter clipboard history.
3. **Transient editor** — Screenshot / record / OCR annotate on capture, then close.
4. **Full workspaces** — Canvas, JSON Studio, and Vault each open in their own window.

Each feature also splits **runtime** (summon, act, dismiss) from **management** (history, pins, retention, settings).

## What to click through

- **Home** desk: OneShot palette (Clipboard, Screenshot, Format, Autofill) plus links to Canvas, JSON Studio, Vault, and history.
- **Clipboard** float: select an item and paste; JSON items can open Format.
- **Format**: Formatted / Minified / Sorted, Undo, open Studio.
- **Displays**: Built-in Display, linked brightness, Night Look, Day / Night / Cinema / Mirror presets.
- **Autofill / Vault**: Filled with “Not added to Clipboard”.
- Cross-flows: shot Copy & Close can land on clipboard; vault fill does not.

Reference screenshots (English UI) are under [`docs/screenshots/`](docs/screenshots/).

## Simulation scope

Sample records, paste, permissions, hotkeys, and save failures are simulated in the browser. The prototype does not read the system clipboard, register global hotkeys, request OS permissions, or call the network. Refresh restores sample state.

Real macOS integration, cross-app paste, performance, and a native app build are not verified in this repository.

## Icons

UI icons are from [Lucide](https://github.com/lucide-icons/lucide) (ISC; Feather-derived icons MIT). License text is embedded in the HTML. The OneShot mark is separate.
