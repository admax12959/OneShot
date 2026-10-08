# OneShot v1 — user stories

Source: the rebuild brief (2026-10-06), the product shape in `README.md` / `docs/ARCHITECTURE.md`, and the v3 native-readiness
absorption (2026-10-07, `PLAN.md`). v3 stories are marked **(v3)**.
Nothing outside these stories gets a screen. Canvas is cut from v1.

Each story has one acceptance line. "Done" means it can be clicked end to end in `prototype-v3/index.html`.

## Shell

| ID | Story | Acceptance |
|---|---|---|
| SH-1 | As a user, I can reach every feature and Preferences from any OneShot window. | One management window with a left rail; Preferences opens from the rail, ⌘, and the OneShot menu; no other nav. |
| SH-2 | As a user, I change all settings in one Preferences window. | One window: General, Privacy, Hotkeys, Storage, then one pane per feature (behaviour, shortcuts, menu bar item, data); every setting states what it changes at runtime. |
| SH-3 | As a user, I see which permissions OneShot has and grant a missing one where I hit it. | Privacy pane shows each state (allowed, not allowed, needs approval, out of date, not available); every gated surface uses the same grant card for that state; granting unblocks in place. **(v3)** |
| SH-4 | As a user, I know what may enter clipboard history. | Privacy pane lists sources and exclusions; Vault is always excluded and its copies are marked concealed; copies other apps mark concealed/transient are skipped; the last copy's types are visible. **(v3)** |
| SH-5 | As a user, I see and change every hotkey in one place. | Hotkeys pane; a change re-binds the key and updates every label; the recorder refuses and explains: needs a modifier, shift only, reserved by macOS, used by every app's menus, already used by another OneShot action (with Show). **(v3)** |
| SH-6 | **(v3)** OneShot behaves like a menu bar app. | Opening a OneShot window makes OneShot active (its menus show); closing the last one returns to the previous app; floats and popovers never take focus; File/Edit menu items enable only when the focused view can act. |
| SH-7 | **(v3)** My data and settings are still there next time. | History, documents, presets, entries, settings, hotkeys and permissions survive a reload; Storage pane shows each store's rule, size, last save and path; Reset removes everything after confirmation. |

## Clipboard

| ID | Story | Acceptance |
|---|---|---|
| CB-1 | When I copy in an app, the item is kept. | Copy in TextEdit/Safari appears at top of the float and the history list. Excluded apps are not kept. |
| CB-2 | I summon history at the caret and paste an older item. | Hotkey opens float at caret; ↑↓/↵ pastes into the document; the item moves to top in float and history; Esc dismisses. |
| CB-3 | I manage history. | List, detail, search, type filter, pin, delete, clear all. Pin/delete show in the float. |
| CB-4 | My settings change what history does. | Retention limit prunes history; float size changes item count; pinned-first changes order; hotkey re-binds. |
| CB-5 | I can send a JSON clip to Format. | JSON item → Format opens on that clip's text (handoff, see HO-2). |
| CB-6 | **(v3)** History stays fast and honest when it's big. | Loading placeholder; search shows it's working; no match differs from empty; a 10,000-clip history shows a capped list with counts; the retention rule is visible and lowering it says what was removed. |

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
| SS-9 | **(v3)** Saving tells the truth. | Save shows progress; success names the file; disk full and missing folder fail with what happened and that nothing partial was written. |

## Battery

| ID | Story | Acceptance |
|---|---|---|
| BT-1 | I glance at battery from the menubar. | Popover: charge, state, time estimate, active limit. |
| BT-2 | I cap charging. | Charge limit on/off + % (needs privileged helper). Changes in Preferences, side pane or popover all agree. |
| BT-3 | Charging pauses when the Mac is hot. | Pause-when-hot on + hot → popover shows "Paused — hot". |
| BT-4 | I review battery history. | Chart 24 h / 7 d, health, cycles. |
| BT-5 | **(v3)** Charge control fails safe and says why. | Helper states (add, approval, update, not available) each have a card; if the helper stops responding, charging returns to macOS control and says so; wake re-applies the limit. |

## Displays

| ID | Story | Acceptance |
|---|---|---|
| DS-1 | I adjust brightness from the menubar. | Popover slider per display; linked brightness moves all supported displays. |
| DS-2 | I warm the screen at night. | Night Look toggle + warmth; visible on the desk. |
| DS-3 | I switch presets. | Apply, save current as preset, delete preset. |
| DS-4 | Displays that can't be controlled say so. | DDC-unsupported display shows a placeholder, not a dead slider. |
| DS-5 | Settings pane matches the popover. | Side pane edits push to the popover and vice versa. |
| DS-6 | **(v3)** I know how each display is controlled. | Each display shows its backend (built-in, DDC/CI, software dimming, not supported) and why; wake / arrangement change re-check; a failed DDC write reverts and says so. |

## JSON

| ID | Story | Acceptance |
|---|---|---|
| JS-1 | I format selected JSON in place. | Select text → hotkey → pill: Formatted / Minified / Sorted, Undo; Esc dismisses; click on the desk does not re-run. |
| JS-2 | Invalid JSON tells me where. | Failure pill with line/column; text unchanged. |
| JS-3 | I continue in Studio. | Open in Studio selects the same document (HO-2). |
| JS-4 | I manage documents in Studio. | List, open, edit, new, delete, validate; formatted runs appear as documents. |
| JS-5 | My settings change formatting. | Indent and sort-keys change output; hotkey re-binds. |
| JS-6 | **(v3)** Big documents don't freeze anything. | Large documents format in the background with a loading state; the status bar shows validity, size and line:col of the first error. |

## Vault

| ID | Story | Acceptance |
|---|---|---|
| VT-1 | I autofill a login. | Login field → float with entries for the URL; ↑↓/↵ fills; Esc dismisses. |
| VT-2 | Vault unlocks with Touch ID. | Locked at launch → Touch ID, with the Mac's login password as the system fallback (no separate master password); failure, unavailable and lockout each say what to do; lock timeout and Lock Now work. **(v3)** |
| VT-3 | No entry for this site. | Float says so and offers to add one in Vault with the URL filled (HO-3). |
| VT-4 | I jump from Autofill to the entry. | Open in Vault selects the same entry (HO-3). |
| VT-5 | I manage entries. | List, detail, search, new, edit, delete; edits show in Autofill. |
| VT-6 | Passwords never enter history. | Fill/copy from Vault never adds a clip; toast says so. |
| VT-7 | My settings change Autofill. | Lock timeout, Touch ID requirement, show-on-focus, hotkey change runtime. |
| VT-8 | **(v3)** Secrets never appear on screen. | No reveal; masks don't show length; changing a password is write-only; copies are concealed and say so; a missing marker is reported as a failure. |

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
