# OneShot v1 — user stories

Source: the rebuild brief (2026-10-06) plus the product shape in `README.md` / `docs/ARCHITECTURE.md`.
Nothing outside these stories gets a screen. Canvas is cut from v1.

Each story has one acceptance line. "Done" means it can be clicked end to end in `prototype-v2/index.html`.

## Shell

| ID | Story | Acceptance |
|---|---|---|
| SH-1 | As a user, I can reach every feature and Preferences from any OneShot window. | One left rail on every OneShot window; no other nav. |
| SH-2 | As a user, I change all settings in one Preferences sheet. | One sheet, one section per feature; every setting states what it changes at runtime. |
| SH-3 | As a user, I see which permissions OneShot has and grant a missing one where I hit it. | Permissions status in Preferences; every gated surface uses the same inline grant; granting unblocks in place. |
| SH-4 | As a user, I know what may enter clipboard history. | Clipboard policy in Preferences lists sources and exclusions; Vault is always excluded. |
| SH-5 | As a user, I see and change every hotkey in one place. | Hotkey registry in Preferences; a change re-binds the key and updates every label; conflicts are rejected. |

## Clipboard

| ID | Story | Acceptance |
|---|---|---|
| CB-1 | When I copy in an app, the item is kept. | Copy in TextEdit/Safari appears at top of the float and the history list. Excluded apps are not kept. |
| CB-2 | I summon history at the caret and paste an older item. | Hotkey opens float at caret; ↑↓/↵ pastes into the document; the item moves to top in float and history; Esc dismisses. |
| CB-3 | I manage history. | List, detail, search, type filter, pin, delete, clear all. Pin/delete show in the float. |
| CB-4 | My settings change what history does. | Retention limit prunes history; float size changes item count; pinned-first changes order; hotkey re-binds. |
| CB-5 | I can send a JSON clip to Format. | JSON item → Format opens on that clip's text (handoff, see HO-2). |

## Screenshot

| ID | Story | Acceptance |
|---|---|---|
| SS-1 | I capture a region. | Hotkey/menubar → drag a region; Esc cancels. Needs Screen Recording; without it, inline grant. |
| SS-2 | I annotate before sharing. | Arrow, rectangle and text draw on the capture; Undo removes the last mark. |
| SS-3 | I copy the capture and find it again. | Copy & Close writes clipboard history and screenshot history; toast opens the new clip (HO-1). |
| SS-4 | I save the capture. | Save writes to the configured folder/format; saving can fail and says so. |
| SS-5 | I extract text. | OCR shows progress, then text; copy text goes to clipboard history. |
| SS-6 | I record a region. | Record → menubar timer → Stop or Esc; recording lands in history. |
| SS-7 | I browse past captures. | Grid with search, kind filter, open, copy, delete. |
| SS-8 | My settings change capture. | After-capture action, format, save folder, retention, hotkeys each change runtime. |

## Battery

| ID | Story | Acceptance |
|---|---|---|
| BT-1 | I glance at battery from the menubar. | Popover: charge, state, time estimate, active limit. |
| BT-2 | I cap charging. | Charge limit on/off + % (needs privileged helper). Changes in Preferences, side pane or popover all agree. |
| BT-3 | Charging pauses when the Mac is hot. | Pause-when-hot on + hot → popover shows "Paused — hot". |
| BT-4 | I review battery history. | Chart 24 h / 7 d, health, cycles. |

## Displays

| ID | Story | Acceptance |
|---|---|---|
| DS-1 | I adjust brightness from the menubar. | Popover slider per display; linked brightness moves all supported displays. |
| DS-2 | I warm the screen at night. | Night Look toggle + warmth; visible on the desk. |
| DS-3 | I switch presets. | Apply, save current as preset, delete preset. |
| DS-4 | Displays that can't be controlled say so. | DDC-unsupported display shows a placeholder, not a dead slider. |
| DS-5 | Settings pane matches the popover. | Side pane edits push to the popover and vice versa. |

## JSON

| ID | Story | Acceptance |
|---|---|---|
| JS-1 | I format selected JSON in place. | Select text → hotkey → pill: Formatted / Minified / Sorted, Undo; Esc dismisses; click on the desk does not re-run. |
| JS-2 | Invalid JSON tells me where. | Failure pill with line/column; text unchanged. |
| JS-3 | I continue in Studio. | Open in Studio selects the same document (HO-2). |
| JS-4 | I manage documents in Studio. | List, open, edit, new, delete, validate; formatted runs appear as documents. |
| JS-5 | My settings change formatting. | Indent and sort-keys change output; hotkey re-binds. |

## Vault

| ID | Story | Acceptance |
|---|---|---|
| VT-1 | I autofill a login. | Login field → float with entries for the URL; ↑↓/↵ fills; Esc dismisses. |
| VT-2 | Vault unlocks with Touch ID. | Locked → Touch ID; failure shows retry; lock timeout and Lock now work. |
| VT-3 | No entry for this site. | Float says so and offers to add one in Vault with the URL filled (HO-3). |
| VT-4 | I jump from Autofill to the entry. | Open in Vault selects the same entry (HO-3). |
| VT-5 | I manage entries. | List, detail, search, new, edit, delete; edits show in Autofill. |
| VT-6 | Passwords never enter history. | Fill/copy from Vault never adds a clip; toast says so. |
| VT-7 | My settings change Autofill. | Lock timeout, Touch ID requirement, show-on-focus, hotkey change runtime. |

## Handoffs

| ID | Handoff | Acceptance |
|---|---|---|
| HO-1 | Screenshot → Clipboard | Toast "Open" lands in Clipboard with the new clip selected. |
| HO-2 | Clipboard → Format → Studio | Clip text formats; Studio opens with that document selected. |
| HO-3 | Autofill → Vault | Vault opens with the same entry (or a new entry for the URL) selected. |

## States (every feature)

| ID | Acceptance |
|---|---|
| ST-1 | Empty, loading and failure placeholders exist in every data view. |
| ST-2 | No-permission placeholders: Screen Recording, Accessibility, privileged helper. |
| ST-3 | Unsupported DDC, Touch ID failed, vault locked, invalid JSON, no vault entry for this URL. |

## Cut from v1

Canvas. No board, no screen, no rail item.
