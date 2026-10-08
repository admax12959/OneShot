# Register hotkeys through KeyboardShortcuts, behind our own registry

OneShot hotkeys are registered and persisted by sindresorhus/KeyboardShortcuts (MIT, Carbon `RegisterEventHotKey`),
but only inside our own `HotkeyRegistry`; nothing else imports the library. The recorder UI, the validation rules
and their messages are ours, built on its public `Shortcut(event:)`, `isTakenBySystem` and `setShortcut`. We took the
library for the parts that are fiddly to rebuild (Carbon registration, key-glyph rendering, hotkeys while a menu is
open), about 1–2 days against 3–5 for our own Carbon wrapper. We didn't use its recorder because its refusals are a
silent beep or a modal `NSAlert` with "Use Anyway", where SH-5 needs inline explanations, the shared-menu list and
duplicates named by owner.

## Consequences

- The library is the map's second third-party dependency. Swapping it for our own wrapper only touches `HotkeyRegistry`.
- Bindings persist in `UserDefaults.standard` under the library's `KeyboardShortcuts_<feature>.<action>` keys.
- Reserved shortcuts are read live from the enabled symbolic hotkeys, so they follow the user's System Settings; the owner name ("Spotlight") comes from our own table and is omitted for unknown IDs.
- A combo that passes validation can still fail to register (reported for ⌥-only combos on macOS 15.0–15.1); that is a refusal of its own, not something we guard per macOS version.
