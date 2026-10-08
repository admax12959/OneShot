# OneShot prototype-v3 — plan

v3 evolves `prototype-v2/` (kept as evidence). It is still a clickable HTML/JS design contract. No Swift.
The goal: absorb the native-readiness review (G1–G10) as **visible, simulated surfaces**, at a higher craft bar.

## Top-5 native recommendations → what the prototype shows

| # | Native recommendation | Prototype surface (simulated) | Scenarios |
|---|---|---|---|
| 1 | Shell skeleton: agent app, `ManagementWindowController.show(Route)`, `PreferencesWindowController.open(section:)`, main menu with validation, `@MainActor` stores + actor repositories | Separate **Management window** (rail) and **Preferences window** (toolbar panes); activation flips the menu bar between the host app and OneShot; real OneShot menus whose items enable/disable with the focused view; floats never take key; data and prefs survive reload (`localStorage`); Storage pane shows each store, rule and last save | Start empty · Store fails to load · Slow loading · Reset all data |
| 2 | Permissions model + `PasteboardWriter` + hotkey registry | Permission states beyond granted/missing: **needs approval**, **outdated helper**, **unsupported hardware**, **re-approval**; one grant card per state; Privacy pane shows the last pasteboard write's types (concealed / transient / origin); hotkey recorder with **needs modifier / shift only / reserved by system / used by a menu / conflict(owner)** | Helper needs approval · Helper outdated · Charge control unsupported · Screen Recording re-approval · Writer forgets concealed markers |
| 3 | Vault on Keychain + LocalAuthentication | No master-password constant; Locked → biometry prompt → Unlocked, with fallback to the **login password** prompt (device-owner auth); secrets are never rendered (no reveal; copy is concealed, fill types into the field); "Keychain + LocalAuthentication" is a **release blocker** note | Biometry fails · Biometry unavailable (lid closed) · Lockout after failures |
| 4 | Hardware behind protocols: `BatterySampler`, `DisplayController` backends, SMAppService helper with fail-safe XPC | Battery: live sample card, 24 h / 7 d charts, sampling/prune notes, helper version; Displays: **backend + reason** per display (native / DDC / software / unsupported(reason)), re-probe states | Helper disconnects → charging re-enabled · Wake from sleep → re-probe · Display arrangement changed · DDC write fails |
| 5 | Background filter + diff, coordinated atomic saves | Clipboard and JSON Studio: loading skeleton, filtering indicator, empty vs **no match**, large-store counts; Screenshot save: progress → success / **out of space** with atomic-write copy | Large history (10,000 clips) · Disk is full · Save folder missing |

Strict JSON stays: no JSON5; the trailing comma in the desk text is the JS-2 failure with `line:col`.
Studio documents live in the JSON store ("repository"), not in prefs.

## Design-contract notes

Shipping copy stays product copy. Native intent (type names, API names, release blockers) is shown only when
**Scenarios → Show native contract notes** is on: small blue chips via `OS.ui.note(text)`.

## Stub in HTML/JS vs owned by the Swift shell later

| Concern | Prototype (stub only) | Swift shell owns |
|---|---|---|
| Shell skeleton | `#win` / `#prefwin` divs, fake activation, `localStorage` store, simulated latency | `NSApplication` accessory/regular policy, window controllers, `NSMenu` + `NSMenuItemValidation`, `@Observable` stores, actor repositories (SwiftData/SQLite) |
| PasteboardWriter / Watcher | `OS.pasteboard.copy` records a `types` list; scenario drops the markers | `NSPasteboard` writes with `org.nspasteboard.ConcealedType`/`TransientType` + private origin type; `changeCount` watcher honoring others' markers |
| Hotkey registry | string combos, simulated symbolic-hotkey table | Carbon `RegisterEventHotKey`, `CopySymbolicHotKeys`, persisted `KeyCombo` |
| Permissions | state map + mock System Settings / Login Items | `AXIsProcessTrusted`, ScreenCaptureKit preflight/request, `SMAppService` status, polling only while a card is visible |
| Keychain vault | entries in `localStorage` with secrets masked in UI; biometry is a dialog | Keychain items with `SecAccessControl` (`.biometryCurrentSet` / `.userPresence`), `LAContext`; **release blocker** |
| Hardware | ticking numbers, capability table, scenarios | `IOPS*` sampler actor, SMC helper over XPC (code-signing requirement, fail-safe), `DisplayController` backends behind a protocol |
| Files | simulated save with progress and failures | `NSFileCoordinator` + atomic write, `NSFileWriteOutOfSpaceError` mapping |

## Order of work
1. Shell v3 (window model, menus, activation, store, permissions, hotkeys, pasteboard types, states, notes, look).
2. Features on the new shell, two at a time: Clipboard + Vault · Screenshot + JSON · Battery + Displays.
3. Tests per feature (Playwright) + `tools/capture.js` shots; SPEC/STORIES updated where the contract changed.
