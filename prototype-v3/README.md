# OneShot v1 — clickable prototype (rebuild)

Open `index.html` in Chrome or Safari at a window of at least **1440 × 900** (the simulated Mac; no responsive layout).
No build step. `../prototype/` is the abandoned first build and is kept only as evidence.

- `STORIES.md` — the source of truth (story IDs used everywhere below).
- `SPEC.md` — per feature: data, config keys and their runtime effect, runtime states; shell API; handoff contracts.
- `shell.js` / `shell.css` — the shell: one window + rail, Preferences, permissions + grant, clipboard policy,
  hotkey registry, system dialogs, toasts, floats, the desk (TextEdit + Safari).
- `features/<id>.js|css` — Clipboard, Screenshot, Battery, Displays, JSON, Vault. Each owns `OS.data[id]` only.
- `tools/test-<id>.js` — Playwright walk-throughs of every story (`node tools/test-vault.js`).
- `tools/capture.js` — regenerates `shots/`.

## How to drive it

- **Hotkeys** (all rebindable in Preferences → Hotkeys): ⌃⌥V clipboard · ⌃⌥A capture · ⌃⌥R record · ⌃⌥O OCR ·
  ⌃⌥F format selection · ⌃⌥P autofill. The OneShot menubar icon lists the same actions.
- **Menubar**: Screenshot, Battery, Displays popovers; OneShot menu; the wrench = **Scenarios** (conditions such as
  "store fails to load", "start empty", "Mac is hot", "Touch ID: next touch doesn't match", "skip ahead 5 minutes").
  Scenarios set conditions; they never navigate.
- Copy in TextEdit/Safari with ⌘C to create clips. Select a JSON line in TextEdit and press ⌃⌥F.
  Click a Safari login field for Autofill. Close the OneShot window with its red light to see the desk.

Simulated: OS permissions, Touch ID, SMC/DDC, file saving, OCR (reads the text under the region), the clock.
