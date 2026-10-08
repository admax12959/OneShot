# OneShot v1 — feature spec (defined before drawing)

Story IDs refer to `STORIES.md`. Each feature owns **data** and **runtime**. The **shell** owns rail, Preferences,
permissions, clipboard policy, hotkeys, system dialogs, toasts, floats and the simulated desk.

Rule: runtime and data view read the same `OS.data[feature]` object. There are no copies.

---

## Shell

| Concern | Owner object | Notes |
|---|---|---|
| Navigation | `#win` with one `.rail` | Only OneShot window. Rail: 6 features + Preferences. No other nav. |
| Preferences | one sheet, sections: Permissions & Privacy, General (hotkeys), then one per feature | Every control renders its `effect` line. |
| Permissions | `screen` (Screen Recording), `access` (Accessibility), `helper` (privileged helper) | Initial: screen ✗, access ✓, helper ✗. One inline grant card everywhere. Mock System Settings can grant or revoke. |
| Clipboard policy | prefs `policy.TextEdit`, `policy.Safari`, `policy.Screenshot`, `policy.OneShot` (default on) | `Vault` is hard-coded excluded. All writes go through `OS.pasteboard.copy`. |
| Hotkey registry | prefs `hotkey.<feature>.<id>` | Edited only in the Hotkeys section; feature sections show them read-only. Rebinding updates every label; duplicates and system shortcuts (⌘C, ⌘V, ⌘Q…) rejected. |
| Scenarios | menubar flask menu | Conditions only (fail / empty / slow / hot / Touch ID result). Not navigation. |

Minimum screen: 1440 × 900 (the simulated Mac). No responsive layout; below that the page scrolls.

### Shell API (contract for features)

```
OS.feature(def)                       register (see below)
OS.data[id]                           the one source
OS.commit(id, fn)                     fn(data) mutates; emits 'change:<id>' and 'change'
OS.on(evt, fn) -> off                 OS.emit(evt, payload)
OS.watch(el, 'evt1 evt2', fn)         like on, auto-unsubscribes when el leaves the DOM
OS.pref('feature.key')                OS.setPref('feature.key', v)  -> emits 'prefs', 'pref:feature.key'
OS.prefs.render(el, featureId)        renders that feature's controls (Preferences + side panes use this)
OS.perm.has('screen'|'access'|'helper')
OS.perm.request(id) -> Promise<bool>  mock System Settings / helper install dialog
OS.ui.grant(el, permId, purpose)      the one inline grant pattern (re-renders on 'perm')
OS.ui.state(el, {kind, title, body, action:{label, run}})   kind: empty|loading|failure|permission|unsupported|locked
OS.ui.load(el, featureId, render)     loading -> failure(if scenario '<id>.fail') -> render(el)
OS.ui.float({x, y, el, onKey, onClose, cls})   one active float; Esc / outside click close it, nothing else happens
OS.ui.closeFloat()
OS.ui.overlay.open(el, {onKey, onClose}) / OS.ui.overlay.close()   full-screen transient editor
OS.ui.toast(text, {action:{label, run}, icon})
OS.ui.icon('i-clip', cls) -> svg html;  OS.ui.esc(str)
OS.open(featureId, params)            show window, mount feature view with params (e.g. {select:id})
OS.openPrefs(section)                 Preferences scrolled to section
OS.hotkey.label('clipboard.open')     current key label
OS.scn('vault.touchFail')             scenario flag
OS.pasteboard.copy({kind, text, image, source}) -> {recorded, clipId}
OS.provide(name, fn) / OS.call(name, payload)    cross-feature handoffs (listed below)
OS.system.touchId(reason) -> Promise<bool>;  OS.system.confirm(title, body, ok) -> Promise<bool>
OS.host.textedit / OS.host.safari     simulated apps on the desk (see shell.js)
OS.desk.set({dim, warm})              built-in display brightness / Night Look on the whole screen
OS.menubar.refresh()                  redraw status items
OS.now()                              simulated clock (ms)
```

Feature definition:

```
{ id, name, icon, seed(), empty(),          // seed data; empty() -> data for the "start empty" scenario
  prefs:   [{key, label, type:'toggle'|'select'|'slider'|'text', options, min, max, step, unit, default, effect, needs}],
  hotkeys: [{id, label, default, run}],
  scenarios: [{key, label}],               // shell adds '<id>.fail' and '<id>.empty' automatically
  menubar: {icon, order, label(), render(el)},   // optional popover
  view:    {title, mount(el, params)} }    // management view; rail item
```

### v3 shell additions (absorbs the native-readiness review, G1–G10)

```
Windows / activation (G10)
OS.app.active() / OS.app.activate(app) / OS.app.policy() -> 'regular' | 'accessory' / OS.app.keyWindow()
  OneShot is an agent app. Opening #win or #prefwin activates OneShot (menu bar shows OneShot menus); closing the
  last one returns to the previous app. Floats and popovers never activate OneShot (non-activating panels).
OS.open(fid, params)                  management window (#win) + rail; one instance, never rebuilt
OS.openPrefs(pane)                    Preferences window (#prefwin): General · Privacy · Hotkeys · Storage · one pane per feature
OS.closeWindow('#win'|'#prefwin')
OS.responder(el, {new, undo, copy, delete, selectAll, find})   each {label?, enabled?():bool, run()}; drives the
                                      Edit/File menus and ⌘ key equivalents while #win is key (NSMenuItemValidation)
OS.ui.subtitle(text)                  window subtitle (counts) ; OS.ui.toolbarTools() -> toolbar element for extra buttons

Store (G1)
OS.data[id] is loaded from the store when present, else seed(). Every OS.commit is saved (coalesced, flushed on quit).
OS.store.path(id) / info(id) -> {at, bytes} / line(def) / restored[id] / reset()
feature def: about:'one line', store:{count(data)->n, unit:'clips', rule()->'Keeps 50 unpinned clips'}
init() runs after load: reset transient runtime fields there (e.g. Vault locks at launch).
Scenario '<id>.empty' never overwrites stored data.

Permissions (G5)
OS.perm.state(id) -> 'granted' | 'missing' | 'approval' | 'outdated' (helper) | 'unsupported' (helper)
OS.perm.has(id) is state === 'granted'; OS.ui.grant(el, id, purpose) renders the right card for each state.

Hotkeys (G4)
OS.hotkey.validate(full, combo) -> {ok} | {err:'needsModifier'|'shiftOnly'|'reserved'|'menu'|'conflict', by?, owner?}
OS.hotkey.set(full, combo) / reset(full) / message(err)

Pasteboard (G3)
OS.pasteboard.copy(item) -> {recorded, clipId, concealed, types, tooLarge}; text over OS.pasteboard.historyMax reaches the pasteboard but not history; Vault copies are stamped
org.nspasteboard.ConcealedType + TransientType (scenario 'pb.unstamped' simulates the writer bug).

Background work (G8)
OS.bg(key, fn, ms?) -> Promise; latest call per key wins, earlier ones never resolve (cancelled Task).

Authentication (G2)
OS.system.authenticate(reason, {fallback:'password'}?) -> {ok, method:'biometry'|'password'} | {ok:false, reason:'nomatch'|'cancel'}
  device-owner policy: Touch ID, with the Mac login password as the system fallback. No app master password.

States / notes
OS.ui.state kinds add 'nomatch' and 'info'; options detail (mono footnote) and note.
OS.ui.skeleton(el, rows) list placeholder. OS.ui.note(text) -> contract chip, visible with Scenarios → Show native contract notes.
OS.ui.toast(text, {sub, icon, kind:'failure'|'concealed', action, note, ms})
```

### Handoff contracts

| Name | Payload | Arrival |
|---|---|---|
| `OS.open('clipboard', {select:clipId})` | clip id from `pasteboard.copy` | Clipboard view, that clip selected and scrolled into view |
| `OS.call('json.format', {text, source:'Clipboard', clipId, x, y})` | JSON text | Format pill on that text; creates/updates a Studio document |
| `OS.open('json', {select:docId})` | doc id | Studio, that document open |
| `OS.open('vault', {select:entryId})` / `{create:{url}}` | entry id or URL | Vault, entry selected / new entry form with URL filled |

---

## Clipboard

**Data** `OS.data.clipboard.clips[]`: `{id, kind:'text'|'json'|'url'|'image', text, image:{w,h,shotId}?, source, pinned, at}`. Order = `at` desc. Paste sets `at = now`.

| Config key | Default | Runtime effect |
|---|---|---|
| `hotkey.clipboard.open` | ⌃⌥V | Opens the float at the caret |
| `clipboard.limit` | 50 | Unpinned items beyond N are pruned from float and history |
| `clipboard.floatCount` | 8 | Number of rows in the float |
| `clipboard.pinnedFirst` | off | On: pinned items lead the float and list. Off: pins only protect from pruning |
| policy toggles (shell) | on | Copies from that source are / aren't recorded |

| Runtime | Behaviour |
|---|---|
| entry | hotkey or OneShot menu → float at TextEdit caret |
| in progress | ↑↓ select, type to filter |
| success | ↵ / click pastes into TextEdit, item moves to top, float closes |
| failure | Accessibility missing → grant card in float; history fails to load → failure state |
| interrupt | Esc or click outside → closes, nothing pasted |
| exit | float closed, caret after pasted text |

## Screenshot

**Data** `OS.data.screenshot.shots[]`: `{id, kind:'image'|'recording', rect:{x,y,w,h}, marks:[{t:'arrow'|'rect'|'text',...}], ocr, format, path, duration, at}`.

| Config key | Default | Runtime effect |
|---|---|---|
| `hotkey.screenshot.capture` / `.record` / `.ocr` | ⌃⌥A / ⌃⌥R / ⌃⌥O | Start that mode |
| `screenshot.after` | edit | edit → editor; copy → straight to clipboard; save → straight to folder |
| `screenshot.format` | PNG | File extension + history label |
| `screenshot.folder` | ~/Desktop | Save path + toast |
| `screenshot.retention` | 30 days | Older shots are pruned |

| Runtime | Behaviour |
|---|---|
| entry | hotkey / menubar → Screen Recording gate → crosshair overlay |
| in progress | drag region; annotate; OCR spinner; recording timer in menubar |
| success | Copy & Close → clip + shot + toast "Open"; Save → path toast |
| failure | no permission; save fails ("disk full" scenario); OCR finds no text |
| interrupt | Esc while selecting/editing discards; Esc while recording stops and keeps |
| exit | overlay closed |

## Battery

**Data** `OS.data.battery`: `{charge, plugged, temp, health, cycles, history:{h24:[], d7:[]}}`. Simulated tick changes charge.

| Config key | Default | Runtime effect |
|---|---|---|
| `battery.limitOn` | off (needs helper) | Charging holds at the limit |
| `battery.limit` | 80 % | Hold point; chart limit line; time estimate target |
| `battery.pauseHot` | on | When hot, charging pauses ("Paused — hot") |
| `battery.showPercent` | on | Menubar shows percentage |

Runtime states: charging, holding at limit, paused hot, on battery, helper missing (limit can't apply → grant).

## Displays

**Data** `OS.data.displays`: `{list:[{id, name, kind, ddc, brightness}], presets:[{id, name, values:{displayId:b}, night}], night:bool}`.

| Config key | Default | Runtime effect |
|---|---|---|
| `displays.link` | on | One slider moves every supported display |
| `displays.warmth` | 50 % | Night Look tint strength on screen |
| `displays.step` | 5 % | Slider step in popover and pane |

Runtime: built-in brightness dims the simulated screen; Night Look tints it; LG TV has no DDC → "unsupported" placeholder; presets apply all values.

## JSON

**Data** `OS.data.json.docs[]`: `{id, name, text, source, at}`. Validity is computed, not stored.

| Config key | Default | Runtime effect |
|---|---|---|
| `hotkey.json.format` | ⌃⌥F | Format the TextEdit selection |
| `json.indent` | 2 | 2 / 4 / tab in Formatted output |
| `json.sortKeys` | off | Formatted output sorts keys |

| Runtime | Behaviour |
|---|---|
| entry | select text in TextEdit + hotkey (Accessibility gate) |
| success | selection replaced, pill: Formatted / Minified / Sorted / Undo / Open in Studio; a doc is saved |
| failure | invalid JSON → pill with line:col, text unchanged; nothing selected → hint |
| interrupt | Esc / outside click → pill closes, text keeps current mode |

## Vault

**Data** `OS.data.vault`: `{entries:[{id, title, url, username, password, note, at}], locked, unlockedAt}`.

| Config key | Default | Runtime effect |
|---|---|---|
| `hotkey.vault.autofill` | ⌃⌥P | Open Autofill on the focused field |
| `vault.lockAfter` | 5 min | Vault re-locks after N simulated minutes |
| `vault.touchId` | on | on → Touch ID; off → master password (`oneshot`) |
| `vault.showOnFocus` | on | Focusing a login field opens Autofill |

| Runtime | Behaviour |
|---|---|
| entry | focus login field / hotkey; locked → Touch ID |
| success | ↵ fills username + password; toast "Filled · not added to Clipboard history" |
| failure | Touch ID fails → retry / password; no entry for URL → add in Vault |
| interrupt | Esc / outside click → closes, nothing filled |

Policy: every Vault copy calls `OS.pasteboard.copy({source:'Vault'})`, which never records.
