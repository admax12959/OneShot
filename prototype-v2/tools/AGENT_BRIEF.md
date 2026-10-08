# Brief for feature builders

You are building two features of the OneShot v1 clickable prototype (a macOS utility simulated in one HTML page).
The old prototype in `../prototype/` is abandoned — do not read it, copy from it, or edit it.

## Read first (in this order)
1. `prototype-v2/STORIES.md` — the only source of truth. No screen for behaviour that isn't in a story.
2. `prototype-v2/SPEC.md` — data / config / runtime per feature + the shell API contract + handoff contracts.
3. `prototype-v2/shell.js` and `prototype-v2/shell.css` — the shell. Use its API and CSS primitives.
4. `prototype-v2/index.html` — load order. `icons.js` defines Lucide symbols; use `OS.ui.icon('i-…')`.
   Available ids: run `grep -o 'id="i-[a-z0-9-]*"' prototype-v2/icons.js`.

## You may write ONLY
`prototype-v2/features/<id>.js` and `prototype-v2/features/<id>.css` for your two features, and test scripts in
`prototype-v2/tools/test-<id>.js`. Do NOT edit shell.js, shell.css, index.html, or other features' files — other
agents are editing those in parallel. If the shell blocks you, work around it inside your file and list the exact
shell change you need under "Shell requests" in your report.

## Hard rules
- **One source.** Data lives only in `OS.data[id]` (from `seed()`); mutate only through `OS.commit(id, fn)`.
  Runtime (float/popover/overlay) and the management view both read it, and both re-render via
  `OS.watch(el, 'change:<id> prefs perm scn', …)`. A runtime action must show in the view and vice versa.
- **Config** = `prefs` in your feature def. Each has a real `effect` sentence and must visibly change runtime.
  Preferences renders them automatically. No static text pretending to be a setting. Side panes use
  `OS.prefs.render(el, id, {keys})` so they stay in sync.
- **No dead controls.** Every visible button works, or it is not drawn.
- **Shell owns navigation.** Your view mounts into `#view` (you may add a `.toolbar`). No own window chrome, no tabs
  that act as nav, no second nav. Use `OS.open` / `OS.openPrefs` for cross-navigation.
- **States.** Data view uses `OS.ui.load(el, id, render)` (gives loading + failure via scenarios). Empty state
  via `OS.ui.state(el, {kind:'empty', …})` when the list is empty (scenario `<id>.empty` empties data).
  Missing permission → `OS.ui.grant(el, permId, purpose)`; never invent another grant UI.
- **Runtime states** from SPEC: entry, in progress, success, failure, interrupt, exit. Esc and outside-click close
  floats (shell does this — pass `onClose` / `onKey`). A click on the desk must never re-run an action.
- **Handoffs** exactly per SPEC's contract table; the same object must be selected on arrival
  (`OS.open(id, {select})` → your `view.mount(el, params)` must honour params).
- Copy is product English. Never use the words demo, prototype, example, lorem, guidance, review in UI text.
- Look: near-white, quiet, macOS. Reuse shell classes: `.btn .btn.primary .btn.icon .btn.ghost .seg .sw .field
  .search .toolbar .split>.list/.detail .pane .row .row.sel .sec-h .kv .tag .kbd .muted .mono .pop-h .pop-b .pop-f .menu`.
  Prefix your own classes with your feature id (e.g. `.cb-`).

## Testing (required)
- Smoke: `cd prototype-v2 && node tools/smoke.js /tmp/x.png "open=<id>"` → must print `no errors`.
- Write `tools/test-<id>.js` (Playwright at `/tmp/pw/node_modules/playwright`, viewport 1440×900, file:// URL,
  copy the boot pattern from tools/smoke.js). Walk every story of your features end to end, assert the key effects
  (e.g. item moved to top, pref changed output), fail loudly, and save screenshots to `/tmp/<id>-NN-name.png`.
  Hotkeys: `page.keyboard.press('Control+Alt+KeyV')`. Scenarios: click the wrench in the menubar, or call
  `page.evaluate` only for setup that a user could also do via the UI.
- Look at your screenshots with the Read tool and fix what looks broken or cramped.

## Report (final message, concise)
1. Files written. 2. For each story ID of your features: completable / blocked + why. 3. Handoffs: what you call
or provide. 4. Shell requests (exact). 5. List of screenshot paths that best show: runtime, data view,
Preferences section, each required state.
