# Brief for v3 feature builders

You are refining two features of the OneShot **prototype-v3**: a clickable HTML/JS design contract for a native
macOS menu-bar agent app. It simulates the Mac. **No Swift.** Do not clone or read other apps. Do not add product scope.

## Read first (in this order)
1. `prototype-v3/PLAN.md`: why v3 exists. It absorbs the native review G1–G10 as visible, simulated surfaces.
2. `prototype-v3/STORIES.md`: the story IDs. Nothing gets a screen unless a story or this brief asks for it.
3. `prototype-v3/SPEC.md`: the shell API, **including "v3 shell additions"**, plus your features' data, config and runtime.
4. `prototype-v3/shell.js` and `shell.css`: the shell. Use its API and CSS primitives. `prototype-v3/index.html` gives the load order.
5. Your two feature files as they stand (v2 code, already running on the v3 shell).

## You may write ONLY
- `prototype-v3/features/<id>.js|css` for your two features.
- `prototype-v3/tools/test-<id>.js` for the same two.

Do NOT edit `shell.*`, `index.html`, `SPEC.md`, `STORIES.md` or other features' files: other agents are working in parallel.
If the shell blocks you, work around it inside your own file and list the exact change you need under "Shell requests".

## What the v3 shell gives you (use it, don't re-invent it)
- **Windows (G10).** `#win` is the management window. It has a unified toolbar (`OS.ui.subtitle(text)` sets the counts line; `OS.ui.toolbarTools()` returns the toolbar element where you add `.btn.tb` icon buttons). Preferences is its own window with a pane per feature, rendered by the shell from your `prefs`, `hotkeys`, `menubar`, `about` and `store`.
- **Menus (G10).** In `view.mount`, call `OS.responder(el, {new, undo, copy, delete, selectAll, find})` with the actions your view supports. Each action is `{label?, enabled?, run}`. These drive the Edit/File menus and the ⌘ key equivalents, and an item is disabled when `enabled()` is false. Re-registering on every render is fine.
- **Store (G1).** Data persists across reloads, so treat `seed()` as first-launch data. Add `about` and `store: {count, unit, rule}` to your def. `init()` runs after load: reset transient runtime fields there.
- **Permissions (G5).** `OS.perm.state(id)` returns granted, missing, approval, outdated or unsupported. `OS.ui.grant` renders the right card for each.
- **Background work (G8).** `OS.bg(key, fn)` gives latest-wins, cancellable simulated background work. The `slow` scenario lengthens it. `OS.ui.skeleton(el)` gives list placeholders.
- **States.** `OS.ui.state` covers empty, loading, failure, permission, unsupported, locked, nomatch and info, and takes `detail` (a mono footnote) and `note`.
- **Contract notes.** `OS.ui.note('…')` makes small blue chips for native intent, such as type and API names or release blockers. They show only when Scenarios → Show native contract notes is on. Shipping copy stays product copy.
- **Toasts.** `kind: 'failure' | 'concealed'`.

## Craft bar (this pass is about taste)
- Aim for a shipping Mac agent app with AppKit density: 13 px text, 22 px controls, 28 px list rows, quiet separators, and accent colour only for intent. Reuse the shell classes: `.btn .btn.primary .btn.tb .seg .sw .field .search .toolbar .split>.list/.detail .pane .row .row.sel .sec-h .kv .tag .kbd .muted .mono .small .pop-h .pop-b .pop-f .menu .state`. Prefix your own classes with your feature id. Avoid generic web-kit look: no big rounded cards, heavy borders, coloured panels or dashed boxes.
- **Selected rows** are accent blue with white text while the window is key, and grey when it isn't. Make sure your icons, tags and thumbnails stay legible on both.
- Write finer pages. Every view needs a toolbar (search, filter or seg, icon actions), a list and a detail, or a purposeful dashboard, plus real empty, loading, failure, permission, unsupported, locked and no-match states, all reachable from Scenarios.
- Keep the four surfaces crisp: status-item popover (`menubar.render`, compact, `.pop-h/.pop-b/.pop-f`), caret/login float (`OS.ui.float`: non-activating, closes on Esc or outside click), full-screen transient editor (`OS.ui.overlay`), and management window + Preferences.
- Microcopy should match native intent: concealed clipboard, helper version, DDC reason, out of space, biometry unlock. Never use demo, prototype, example, lorem, guidance or review in UI text.
- **No dead controls.** Every visible button works, or it isn't drawn.

## Hard rules (kept from v2)
- **One source.** Data lives in `OS.data[id]` and is mutated only through `OS.commit(id, fn)`. Runtime and view both re-render via `OS.watch(el, 'change:<id> prefs perm scn', …)`.
- **Config** is your `prefs`, each with a real `effect` sentence that visibly changes runtime.
- **Shell owns navigation.** Mount into `#view`. Use `OS.open` and `OS.openPrefs(<id>)`. No second nav.
- **Handoffs** follow SPEC exactly: `view.mount(el, params)` must honour `{select}` and `{create}`.
- **Strict JSON only.** No JSON5. The trailing comma in the desk text is the JS-2 failure, reported with line:col.

## Non-goals (do not add or imitate)
Anything from TelegramSwift or Ice; battery sudoers or an smc binary; SMJobBless; MonitorControl's private OSD or
gamma-enforcer; Sparkle or networking; Tauri, Monaco or IndexedDB; CotEditor images; other apps' product features
(SwiftBar plugins, Ice layout, Maccy paste stack, Stats fan control, JsonStudio tree/grid/diff/query/schema).

## Testing (required)
- Smoke: `cd prototype-v3 && node tools/smoke.js /tmp/x.png "open=<id>"` must print `no errors`.
- Update `tools/test-<id>.js` for v3. Use Playwright at `/tmp/pw/node_modules/playwright`, a 1440×900 viewport and a `file://` URL. Each run starts in a fresh browser context, so storage starts empty.
  - Walk every story of your features end to end, plus the v3 items in your task, and assert the key effects.
  - Include at least one **reload** check: change data and a pref, `page.reload()`, and assert both persisted.
  - Assert at least one menu item enables or disables with context (`OS.menus()` or by clicking `#mbL [data-menu=edit]`).
  - Fail loudly. Save screenshots to `/tmp/v3-<id>-NN-name.png`.
- Scenarios: click the wrench, or call `OS.setScn(key, true)` in `page.evaluate` for setup a user could also do in the UI.
- Look at your screenshots with the Read tool. Fix anything that looks broken, cramped or web-generic. Then run your test file again and confirm it passes.

## Report (final message, concise)
1. Files written.
2. Each story ID and each v3 item: done, or blocked and why.
3. Shell requests (exact).
4. What stays a stub in HTML/JS versus what the Swift side must own, for your features.
5. Paths to the best screenshots: runtime surface, data view, Preferences pane, and each required state.
