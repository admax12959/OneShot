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

### Clipboard

**Clip**:
One kept copy in clipboard history: its content, its kind (text, JSON, link, image), its source and when it was last used.
_Avoid_: Item, entry, snippet

**Clipboard history**:
The ordered set of clips OneShot keeps. It's bounded by the history size; pinned clips are never pruned.
_Avoid_: Clipboard log, paste history

**Source**:
The app a copy came from. Clipboard policy decides per source whether its copies become clips.
_Avoid_: Origin app

**Concealed copy**:
A copy marked as secret so clipboard history apps don't keep it. Every Vault copy is concealed.
_Avoid_: Hidden copy, private copy
