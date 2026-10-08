# OneShot v1 — clickable prototype, v3

Open `index.html` in Chrome or Safari at a window of at least **1440 × 900**. There is no build step.
v3 continues `../prototype-v2/`, which is kept as evidence. It absorbs the native-readiness review (G1–G10) as visible,
simulated surfaces; see `PLAN.md`. It is still a design contract, and the Swift build inherits it.

- `STORIES.md`: the source of truth. **(v3)** marks the new or changed acceptance lines.
- `SPEC.md`: per-feature data, config and runtime, the shell API (including "v3 shell additions") and the handoffs.
- `PLAN.md`: maps the native recommendations to surfaces, and what stays a stub here versus what the Swift shell owns.
- `shell.js` / `shell.css`: activation and menus, the management and Preferences windows, the store, permissions, the pasteboard writer, the hotkey registry, states, contract notes and the desk.
- `features/<id>.js|css`: Clipboard, Screenshot, Battery, Displays, JSON, Vault.
- `tools/test-<id>.js`: Playwright walk-throughs, e.g. `node tools/test-vault.js`. `tools/capture.js` regenerates `shots/`.

## How to drive it

- **Activation.** OneShot is a menu bar app. Opening its window or Preferences makes it the active app, and the menu bar then shows OneShot · File · Edit · View · Window. Clicking TextEdit or Safari hands the menu bar back. Floats and popovers never take focus.
- **Hotkeys** (rebindable in Preferences → Hotkeys): ⌃⌥V clipboard · ⌃⌥A capture · ⌃⌥R record · ⌃⌥O OCR · ⌃⌥F format selection · ⌃⌥P autofill.
- **Menu bar.** It has the Screenshot, Battery and Displays items, the OneShot menu, and the wrench, which opens **Scenarios**. Scenarios set conditions such as a store failing, starting empty, helper states, Touch ID results, writer bugs, wake from sleep or a full disk. They never navigate.
- **Scenarios → Show native contract notes** reveals blue chips naming the native type or API behind a surface, plus release blockers. Shipping copy stays product copy.
- **Persistence.** Data and settings live in `localStorage`, which stands in for `~/Library/Application Support/OneShot`. Scenarios → *Reset all data and reload* starts fresh.

Simulated: OS permissions, Touch ID and the login-password fallback, SMC and the helper, DDC, file saving, OCR, the clock, and another clipboard app ("Pasty").
