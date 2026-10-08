# Research: can KeyboardShortcuts cover OneShot's hotkey rules?

Ticket: admax12959/OneShot#7 (map #4). Date: 2026-10-08.
Behaviour contract: STORIES SH-5 and `OS.hotkey.validate` in `prototype-v3/shell.js` (branch `origin/prototype-v3`).

## Sources and method

- sindresorhus/KeyboardShortcuts, MIT. Latest release on GitHub: 3.1.0 (2026-09-11, via `gh api`). Read from a shallow clone at commit `772133d` (2026-09-12, one day after the 3.1.0 release, so possibly slightly ahead of the tag; unverified). Read only, never built or run. Paths below are under `Sources/KeyboardShortcuts/`.
- Apple developer forum thread 763878 (an Apple Frameworks engineer on the macOS 15 hotkey change).
- Apple's reference pages for `RegisterEventHotKey` and `CopySymbolicHotKeys` could not be fetched: the URLs I tried returned 404 or a JS-only shell, and the Command Line Tools SDK headers do not declare either function (only the `.tbd` stubs export them). Anything about their documented contract is **unverified**; behaviour below is inferred from how the library uses them.

## How the library works

- **Registration**: Carbon. `HotKey.swift` calls `RegisterEventHotKey` (target: event dispatcher) and installs one `InstallEventHandler`. Its own comment: Carbon allows one registration per key combination, a second fails. The failure is reported through an internal-only `onRegistrationFailed` callback, so it is not a public duplicate check.
- **Menu-open mode**: while an `NSMenu` is tracking (status-item menus), the library switches from Carbon events to raw key-event monitors. The README says it "works when NSMenu is open" (links its issue #1). This is a real saving for OneShot, whose status item has a menu.
- **Recording**: while a recorder is focused, all hotkeys are paused (`isPaused`) so keys reach the field.
- **Persistence**: `UserDefaults.standard`, key `KeyboardShortcuts_<name>`, value = JSON string of the shortcut (Carbon key code + Carbon modifiers). A stored `false` means disabled. A `Binding<Shortcut?>` recorder mode exists that does not persist or register; the README says you then store it yourself.
- **Public surface usable without its Recorder**: `Shortcut(event:)`, `Shortcut.isTakenBySystem`, `modifiers`, `key`, `description`, `getShortcut/setShortcut/reset/disable/enable`, `onKeyDown`/`events(for:)`, `Name(_, initial:)`. **Not public**: `menuItemTakenByMainMenu`, and the system-shortcut list with owners.
- **OS support**: `Package.swift` `.macOS(.v10_15)`, so macOS 14 is within range. No source mention of macOS 26 handling; the only open GitHub issue (#207) is a SwiftUI recorder request. Behaviour on 26 is **unverified** (not run).
- **macOS 15.0/15.1**: Apple changed `RegisterEventHotKey` so Option-only and Option+Shift combos failed (error -9868); Apple's engineer said it was intentional (anti-keylogging). Per the thread, macOS 15.2 beta 2 relaxed it. The library works around it only when `Constants.isSandboxed` is true (`Shortcut.isDisallowed`, marked TODO-remove at 15.2). The thread does not say it is sandbox-only, so whether an unsandboxed app on 15.0/15.1 is hit is **unverified**. OneShot's floor is 14 and ADR 0001 says not sandboxed, so a user on 15.0/15.1 could record Option-only or Option+Shift combos that silently fail to register. Our rule (needs ⌃, ⌥ or ⌘, so ⌥ alone passes) would permit them. Cheap guard: treat a registration failure as a validation error, or refuse those combos on 15.0 and 15.1.

## The recorder's built-in checks (RecorderCocoa.swift, in order)

1. Modifier gate: accepts if modifiers minus {shift, fn} is non-empty, or the key is a function key. Otherwise **beep and discard**, no message.
2. Main-menu conflict (`ConflictPolicy.menuItem`, default `.block`): alert naming the menu item title.
3. `isDisallowed` (the 15.0/15.1 sandbox case above).
4. System shortcut (`ConflictPolicy.systemShortcut`, default `.warn` with "Use Anyway"): generic alert, does not name the shortcut's owner.
5. `validateShortcut` closure (`.allow` or `.disallow(reason:)`): alert showing our reason; runs last, so only after 1 to 4 pass.

Conflict handling is a modal `NSAlert`. The prototype shows inline per-row messages with "Show" for duplicates, so a library alert is a UX difference for the Hotkeys pane spec to decide.

## Per-rule coverage

| OneShot rule (SH-5 / `validate`) | Library | Verdict |
|---|---|---|
| No modifier refused, with explanation | Refused for ordinary keys, but silent beep, no message. **Bare function keys are accepted** (e.g. F5), which our rule refuses. | Partly. Explanation: not supported. Bare F-key: extendable (validator can reject). |
| Shift-only refused, with explanation | Refused (shift/fn don't count), silent beep, no message. | Behaviour supported, explanation not supported. Showing "⇧ alone isn't enough" needs our own recorder front end. |
| Reserved by macOS (`CopySymbolicHotKeys`) | `isTakenBySystem` reads live, **enabled-only** symbolic hotkeys, compares code+modifiers; bare F12 exempt. Default is warn-with-override. | Supported; set policy `.block`. **Owner name ("Spotlight") not supported**: the library keeps only code, modifiers, enabled. We would need our own call plus a table of symbolic-hotkey IDs to names (unverified that IDs are exposed). |
| Menu equivalents every app uses (⌘C, ⌘Q ...) | Only checks **our own** `NSApp.mainMenu`, exact key+modifier match, skipped if unchanged. | Extendable: static list (as in the prototype) in `validateShortcut`. Our own menu check is a bonus if the shell's real main menu is populated. |
| Duplicate of another OneShot action, owner named | Nothing built in; the docs' example uses `validateShortcut` over other `Name`s. | Extendable and easy: we own the registry, so we name the owner and can offer "Show". |
| Persist, re-bind, update labels | UserDefaults JSON, re-registers on change, `Shortcut.description` for labels. | Supported. Check glyph order matches the prototype's ⌃⌥⇧⌘. |
| Works with status-item menu open | Dedicated menu-open mode. | Supported (costly to build ourselves). |

## What an own Carbon wrapper would cost (estimate, not measured)

Components: `RegisterEventHotKey`/`UnregisterEventHotKey` plus one event handler (small); pause during recording (small); recorder control with key-to-glyph rendering that respects keyboard layouts (medium); persistence (trivial); our validators (needed in every option); hotkeys while an `NSMenu` is tracking (the fiddly part, the library has a bespoke raw-event path for it); macOS 15.0/15.1 quirk handling. Judgement: roughly 3 to 5 working days with tests, versus about 1 to 2 days to adopt the library and write the validator, plus ongoing upkeep. The library's registration layer (`HotKey.swift`) is about 560 lines; `Shortcut.swift` and `Key.swift` are about 1,000 lines, mostly key tables.

## Options

- **A. Library Recorder + `validateShortcut`**: cheapest, but no explanation for no-modifier and shift-only (beep) and modal alerts instead of inline messages.
- **B. Library for registration, persistence and menu-open, with our own recorder UI** using `Shortcut(event:)`, our validator (all five rules, our messages, owner names) and `setShortcut`. Meets SH-5 exactly; only the recorder UI is hand-written. Likely best fit.
- **C. Own wrapper**: only worthwhile if the dependency is rejected; cost above.

## Uncertainties

- Apple's reference pages for the two Carbon calls were not read; symbolic hotkey IDs and names, and what `CopySymbolicHotKeys` returns beyond code, modifiers and enabled, are unverified.
- macOS 26 behaviour, and anything past 15.2, not tested.
- Whether the 15.0/15.1 breakage hits unsandboxed apps.
- The commit read may be ahead of release 3.1.0.
- Menu-open behaviour was read from comments and structure, not exercised.
- Cost estimates are judgement.
