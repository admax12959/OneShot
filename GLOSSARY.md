# OneShot

A local macOS utility suite that lives in the menu bar: clipboard history, capture, battery, displays, JSON formatting and a password vault.

## Language

### Surfaces

**Status item**:
OneShot's icon in the menu bar, plus the popover it opens.
_Avoid_: Tray icon, menu bar widget

**Float**:
A small panel summoned near the caret or a login field. It acts without taking focus from the app you're in.
_Avoid_: Popup, overlay, HUD

**Management window**:
The single OneShot window, with a rail of features, where history and data are browsed and managed.
_Avoid_: Main window, dashboard

**Hotkey**:
A key combination that runs a OneShot action from any app. Each action has a default that can be changed or turned off in one place.
_Avoid_: Global shortcut, keyboard shortcut (a shortcut is an app's own menu equivalent, such as ⌘C)

### Data

**Store**:
One feature's kept data, kept and reset as a unit. The Storage pane shows each store's rule, size, last save and location.
_Avoid_: Database, cache

### Clipboard

**Clip**:
One kept copy in clipboard history: its content, its kind (text, JSON, link, image), its source and when it was last used.
_Avoid_: Item, entry, snippet

**Clipboard history**:
The ordered set of clips OneShot keeps. It's bounded by the history size and an image budget; pinned clips are never pruned.
_Avoid_: Clipboard log, paste history

**Source**:
The app a copy came from. Clipboard policy decides per source whether its copies become clips.
_Avoid_: Origin app

**Concealed copy**:
A copy marked as secret so clipboard history apps don't keep it. Every Vault copy is concealed.
_Avoid_: Hidden copy, private copy

**Clipboard access**:
The permission that lets OneShot read what other apps copy, on Macs that ask for it. Without it, no new clips are kept, but clipboard history stays usable.
_Avoid_: Pasteboard permission, clipboard permission

**Missed copy**:
A copy OneShot would have kept but couldn't read, because clipboard access wasn't allowed.
_Avoid_: Dropped clip, lost clip
