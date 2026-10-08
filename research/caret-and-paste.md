# Research: finding the caret and pasting into the frontmost app

Ticket: [#8](https://github.com/admax12959/OneShot/issues/8) (map [#4](https://github.com/admax12959/OneShot/issues/4)).
Required behaviour: STORIES **CB-2** ("Hotkey opens float at caret; ↑↓/↵ pastes into the document; the item moves to top; Esc dismisses") and **SH-6** ("floats and popovers never take focus"). prototype-v3 SPEC also says: default hotkey `⌃⌥V`, and "Accessibility missing → grant card in float".

Researched 2026-10-08. Sources are Apple SDK headers (read from the local macOS 15 SDK), Apple developer docs and technotes, and the Chromium, Electron and WebKit sources. Behaviour of other open-source apps is used only as **evidence of what happens in practice**. It is not a design to copy. Every claim is marked as one of:

- **[H]** Apple SDK header text
- **[D]** Apple documentation or technote
- **[S]** first-party engine source (Chromium, Electron, WebKit)
- **[E]** evidence from a third-party app's behaviour or code comments
- **[U]** unverified: an inference that a spike must confirm

---

## 1. Answer in one screen

| App family | Caret rect via AX | Paste via synthesized ⌘V | Fallback when the caret is unavailable |
|---|---|---|---|
| AppKit text (TextEdit, Notes, Mail, Xcode, NSTextField/NSTextView) | **Works.** It needs the focused element, then `AXSelectedTextRange`, then `AXBoundsForRange`. [S/E] | **Works** | Not usually needed |
| Safari / WebKit (`<input>`, `<textarea>`, `contenteditable` with role textbox) | **Works.** WebKit exposes `AXSelectedTextRange` and `AXBoundsForRange` on text controls, and its tests cover contenteditable. [S] A plain `contenteditable` without a role is [U]. | **Works** | Focused element frame |
| Chrome / Chromium browsers | **Often fails on the first try.** No web content tree exists until accessibility is switched on. Text fields can then return degenerate (all-zero) rects. [S/E] | **Works** | Focused element frame, then mouse pointer |
| Electron apps (Slack, VS Code, Discord, Notion…) | Same as Chromium. `AXManualAccessibility` turns on the tree. Editors built from custom DOM (Monaco and CodeMirror in VS Code) often have no usable selection range. [S/E/U] | **Works** | Focused element frame, then mouse pointer |
| Terminal.app | **Partial.** The text area is exposed, but bounds for an *empty* range come back as a zero-size rect at a screen edge. Bounds for a one-character range work. [E] | **Works.** It honours ⌘V. With *Secure Keyboard Entry* on, see §4. | One-character range probe, then element frame |
| iTerm2 | Implements bounds-for-range in its own accessibility helper. [E] Whether that works for an empty caret range is [U]. | **Works** | Same as Terminal |
| Java/Swing, Qt, games, remote desktops, some Catalyst apps | **Unreliable or missing**: no focused text element, or `kAXErrorAttributeUnsupported`. [U] | Usually works if the app maps ⌘V. Remote desktops may forward it to the remote side. [U] | Mouse pointer, or the centre of the active screen |
| No Accessibility trust | **None.** AX calls return `kAXErrorAPIDisabled`. [H] | **None.** Posting events is gated (§3.3). | Float at the mouse pointer, showing the grant card required by SPEC. Choosing a clip only copies it. |

**Bottom line:** using the caret is a **best-effort** placement. Every path needs a ranked chain of fallbacks:
caret rect → one-character probe → focused element frame → mouse pointer → active screen.
Synthesized ⌘V after the float closes is **reliable** wherever Accessibility trust exists. It needs a layout-aware keycode, and its timing must be gated on the target being frontmost again.

---

## 2. Finding the caret

### 2.1 The standard path

1. `AXUIElementCreateSystemWide()` → `kAXFocusedUIElementAttribute`. Alternatively, go to the frontmost app's element (`AXUIElementCreateApplication(pid)`) → `AXFocusedUIElement`. [H: AXUIElement.h, AXAttributeConstants.h]
2. `kAXSelectedTextRangeAttribute`: "The range of characters (not bytes) that defines the current selection of an editable text element. Value: An AXValueRef of type kAXValueCFRange." [H: AXAttributeConstants.h]
3. `kAXBoundsForRangeParameterizedAttribute` (`"AXBoundsForRange"`) with that range. It is "the bounding rectangle a sighted user would see on the display screen". [H, D: developer.apple.com/documentation/applicationservices/kaxboundsforrangeparameterizedattribute]
4. Convert from AX/Quartz coordinates (origin at the top-left of the primary screen, y pointing down) to Cocoa coordinates. [D/E]

### 2.2 Failure modes and how they show up

- **The call blocks.** Each AX call is a synchronous IPC round-trip to the target app. `AXUIElementSetMessagingTimeout` exists so callers can bound it. Setting it on the system-wide element applies to the whole process. [H] One app reports the default timeout as roughly 6 s, so a busy target freezes placement unless the timeout is capped. [E: OpenSuperWhisper FocusUtils.swift] → **Recommendation:** cap each call at about 100–250 ms and run the lookup off the main thread [U on the exact value].
- **`kAXErrorCannotComplete`** means "the accessible application is unresponsive or waiting for user input". [H] → Fall back. Do not retry inside the hotkey path.
- **`kAXErrorAttributeUnsupported` / `kAXErrorNoValue`** means the element has no text model. [H] → Fall back to the element frame (`kAXPositionAttribute` + `kAXSizeAttribute`).
- **The call succeeds but returns garbage.** Several apps return success with a degenerate rect. Chrome and Electron return all zeros. Terminal.app returns `x:0 y:<screen height> w:0 h:0`. [E: OpenSuperWhisper comment] A real caret always has a line height, so **reject any rect with height ≈ 0**, and any rect that lies off every screen.
- **Empty range versus one character.** Terminal and some fields cannot measure an empty (collapsed) range, but can measure a one-character range. Probing `{loc,1}` (or `{loc-1,1}` at the end of the text) and taking its left or right edge recovers the caret. [E]
- **Chromium's editable wrapper versus its leaves.** Chromium apps (for example Slack) return degenerate bounds on the editable `AXTextArea` but usable bounds on its `AXStaticText` children. [E: Automattic/harper accessibility_text.rs] Walking the children costs extra IPC. Treat it as an optional tier [U on its value for the caret specifically].

### 2.3 Chromium and Electron: the tree is off by default

- "For performance reasons Chromium waits until it detects the presence of assistive technology before enabling full support for accessibility APIs." On macOS this is triggered by a client setting `AXEnhancedUserInterface`. [S: chromium.org accessibility design doc]
- Current Chrome (`chrome/browser/chrome_browser_application_mac.mm`) does three things [S]:
  - It watches VoiceOver directly.
  - It treats `AXEnhancedUserInterface` from other assistive tools as a request, but **debounces it with a 2-second delay** before turning on complete mode (`kTwoSecondDelay`).
  - When it is merely asked for `accessibilityRole`, it turns on only `kNativeAPIs` while its Sonoma refinements are active. That mode includes **no web contents**, so a page's text fields are not in the tree.
- Electron (`shell/browser/mac/electron_application.mm`) accepts **both** `AXEnhancedUserInterface` and its own settable `AXManualAccessibility` on the application element. Both go through the same delayed enable. [S] The Electron docs tell third-party assistive tools to set `AXManualAccessibility`. [S: electronjs.org/docs/latest/tutorial/accessibility]
- Side effects:
  - Turning on complete mode costs renderer memory. The Chromium commit "Refine a11y detection and enablement on macOS Sonoma" explains that it exists to avoid that cost. [S]
  - Setting `AXEnhancedUserInterface` on an app is reported to break window-manager positioning (Magnet). [E: Apple forums thread 659755]
- Within a text field, Chromium returns `AXSelectedTextRange` only when `IsTextField()` is true, which covers atomic `<input>`/`<textarea>` plus non-atomic text-field roots. [S: ax_node_data.cc, browser_accessibility_cocoa.mm] Password fields hide the visible range. [S]

**Consequence for OneShot.**
- The first ⌃⌥V in a Chromium or Electron app that has no assistive tool running will almost certainly land on a fallback. Later presses can work only if OneShot has switched accessibility on.
- Setting `AXManualAccessibility` on Electron apps is low-risk, because that attribute is meant for third-party tools.
- Setting `AXEnhancedUserInterface` on Chrome has known side effects. **Recommendation for v1:** never set `AXEnhancedUserInterface`. Optionally set `AXManualAccessibility` on Electron apps the first time they are seen. Otherwise accept the fallback (focused element frame, then mouse pointer). This is a product decision for the map. [U on the real-world hit rate.]

### 2.4 Placement rule (proposed)

Try each tier in order and stop at the first that passes validation (height > 0, on a screen):

1. caret rect
2. one-character probe
3. focused element frame (anchor at its top-left or bottom-left)
4. mouse pointer
5. centre of the screen with the key window

Keep the float clamped to the visible frame of the screen that holds the anchor point. Record which tier won, because it is useful for diagnostics.

---

## 3. Pasting

### 3.1 Mechanism

1. Write the clip to `NSPasteboard.general`. This also makes the clip "move to top" (CB-2). OneShot's own watcher must recognise the write as its own, by `changeCount` or by a marker type, so it does not record a duplicate.
2. Close the float.
3. Post ⌘V as `CGEvent` key-down and key-up for `V` with `.maskCommand` set **explicitly on both events**. Post at `kCGHIDEventTap`, or at the session tap. `CGEventPost` "posts the specified event immediately before any event taps instantiated for that location, and the event passes through any such taps". [D: CGEvent.post(tap:)] Tap locations: `kCGHIDEventTap`, `kCGSessionEventTap`, `kCGAnnotatedSessionEventTap`. [H: CGEventTypes.h]
4. Use an event source that does not inherit modifiers the user is still holding. A private-state source (`kCGEventSourceStatePrivate`) [H], or explicit flags, prevents a held ⇧ from turning the event into ⇧⌘V ("paste and match style") [U on whether this is needed once ↵ has been released].

Alternative: AX can set `kAXSelectedTextAttribute` directly on the focused element. It skips the pasteboard but only works for plain text in AX-cooperative fields, does nothing for images, and is unreliable in web and Electron apps. [U] **Not recommended** as the primary path. It could serve as a fallback for text when posting events is denied, but that case also lacks AX trust, so in practice it never helps.

### 3.2 Keyboard layouts (UCKeyTranslate)

- `CGEventCreateKeyboardEvent` takes a **virtual keycode**, which is a physical key position. `kVK_ANSI_V` (9) is "V" only on QWERTY-family layouts. On Dvorak, keycode 9 types "." so posting ⌘+9 sends ⌘. (Stop/Cancel in many apps). [U, follows from the keycode/layout model]
- Find the right key like this:
  - `TISCopyCurrentKeyboardLayoutInputSource()` gives the layout in use, even while an input method is active. [H: TextInputSources.h]
  - `kTISPropertyUnicodeKeyLayoutData` gives its `uchr` data. It is NULL for non-keyboard-layout sources and KCHR-only layouts. [H]
  - Run `UCKeyTranslate` over keycodes 0–127 **with the Command modifier state** and pick the one that yields `v`.
- Command-switching layouts: "Dvorak – QWERTY ⌘" produces different characters with and without ⌘. With ⌘ held, keycode 9 gives "v" again. Translating *with* ⌘ handles this correctly. [E: Clipy/Sauce KeyboardLayout.swift comments]
- Non-Latin layouts (Russian, Greek, Hebrew, Arabic…) have no `v` without ⌘, and some have none with ⌘ either. Fall back to `TISCopyCurrentASCIICapableKeyboardLayoutInputSource()`, "the keyboard layout that will be used for key translation if there is no specific keyboard layout override". [H] If that fails too, use `kVK_ANSI_V`. [U for each specific non-Latin layout]
- Recompute when the layout changes (`kTISNotifySelectedKeyboardInputSourceChanged`), not on every paste. [H]
- **Test matrix for a spike:** US, Dvorak, Dvorak–QWERTY ⌘, Colemak, AZERTY, German, Russian, Japanese Kana (input method active), Pinyin.

### 3.3 Permission

- AX reads require the process to be a trusted accessibility client: `AXIsProcessTrustedWithOptions(kAXTrustedCheckOptionPrompt)`. "Prompting occurs asynchronously and does not affect the return value." [H]
- Posting events has its own check: `CGPreflightPostEventAccess()` and `CGRequestPostEventAccess()` (macOS 10.15+), described as "event synthesizing access". [H: CGEvent.h] On current macOS this access is granted through **Privacy & Security → Accessibility**. Clipboard managers document that list as the one their paste needs. [E: Maccy README FAQ] Apple has not documented the exact mapping. [U]
- Being Developer ID and not sandboxed (ADR 0001) is compatible with both checks. Being sandboxed would block AX control of other apps, which matches the reason ADR 0001 gives.
- Trust is tied to the code signature. Re-signing, a changed bundle ID or a changed path can silently revoke it during development. [U, a common report] Check `AXIsProcessTrusted()` live: on every hotkey press and when the app activates. This matches "Accessibility live" in the skeleton scope.

### 3.4 Timing after the float closes

- SH-6 requires a **non-activating panel**: the target app stays the active app the whole time. A `.nonactivatingPanel` NSPanel can become key, and so receive ↑↓/↵, without activating OneShot. When it orders out, keyboard focus goes back to the target's key window. [D for the style mask. The return of focus is [U] and needs a spike.]
- Because OneShot never activated, nothing has to be "re-activated" before pasting. That removes the main race other clipboard apps face, where they activate themselves and then must wait for the previous app to come back. [U]
- **Recommended sequence:**
  1. Write the pasteboard.
  2. `orderOut` the panel.
  3. Confirm `NSWorkspace.shared.frontmostApplication` is still the PID captured when the hotkey fired. If it is not, do not paste: the clip stays on the clipboard and a toast says so.
  4. Post ⌘V on the next run-loop turn, or after a short delay (about 20–50 ms). [U on the delay; a spike should measure it. 0 ms may be enough for a non-activating panel.]
- Never hold the main thread while waiting for this.

---

## 4. Secure Event Input

- `EnableSecureEventInput`: "keyboard input will only go to the application with keyboard focus, and will not be echoed to other applications that might be using the event monitor target". [H: CarbonEventsCore.h]
- `IsSecureEventInputEnabled()` "returns whether secure event input is enabled by **any** process, not just the current process". [H] It is therefore a **global** signal and does not name the culprit. Apple DTS calls the I/O Registry `kCGSSessionSecureInputPID` lookup "best effort… numerous situations where it won't produce accurate results". [D: Apple forums thread 726353]
- TN2150 lists what secure input blocks: **event taps, HID seize, `GetKeys`**. It does not mention `RegisterEventHotKey` or event *posting*. [D: TN2150]
- **Effects on OneShot:**
  - **Hotkey:** register the global hotkey with `RegisterEventHotKey`, not with a CGEventTap, because taps go blind under secure input. [D] Hotkeys whose combination *types a character* (⌥-letter combinations such as ⌥C → "ç") are reported to stop firing in password fields. ⌘ and ⌃ combinations keep working. [E: Maccy docs/keyboard-shortcut-password-fields.md] The default `⌃⌥V` includes ⌃ and should be safe [U]. The Hotkeys validator could warn about ⌥-only (or ⌥⇧) letter combinations.
  - **Paste:** TN2150 does not say that posted ⌘V is blocked. Password fields normally accept paste. [U] Whether a synthesized ⌘V reaches a focused secure field, or Terminal with Secure Keyboard Entry, is **unverified** and needs a spike.
  - **Caret:** secure text fields are `AXSecureTextField`. Chromium hides some ranges for password fields. [S] Expect the fallback tier.
- **Recommended policy:** always attempt the paste, because the clip is on the clipboard either way. If `IsSecureEventInputEnabled()` is true at paste time, also show a quiet toast ("Copied. Secure input is on, so press ⌘V if nothing pasted"). Do not *refuse* to paste on this signal alone, because it is global and often held by a background app.

---

## 5. Uncertainties to settle in a spike (before or during build)

1. Real hit rate of the caret tier in Chrome, Slack, VS Code and Notion, with and without OneShot setting `AXManualAccessibility`, and whether the 2 s Chromium/Electron debounce makes the *second* press reliable.
2. Whether focus returns cleanly to the target after a key, non-activating panel orders out, and the minimum safe delay before posting ⌘V.
3. Whether synthesized ⌘V reaches secure fields and Terminal's Secure Keyboard Entry.
4. `UCKeyTranslate` results for the layout matrix in §3.2, especially non-Latin layouts and active input methods (Japanese, Chinese).
5. Whether `⌃⌥V` fires in password fields under secure input.
6. iTerm2 caret bounds for an empty range. Behaviour of Java/Qt/Catalyst apps.
7. How `CGPreflightPostEventAccess` relates to the Accessibility list on macOS 14 and 15. Apple has not documented it.

## 6. Sources

- Local SDK headers (MacOSX.sdk, CLT 2025):
  - `HIServices/AXUIElement.h` (error semantics, `AXIsProcessTrustedWithOptions`, `AXUIElementSetMessagingTimeout`)
  - `HIServices/AXAttributeConstants.h` (`kAXSelectedTextRangeAttribute`, `kAXBoundsForRangeParameterizedAttribute`)
  - `CoreGraphics/CGEvent.h`, `CGEventTypes.h` (`CGPreflightPostEventAccess`, tap locations, `kCGEventSourceStatePrivate`)
  - `HIToolbox/CarbonEventsCore.h` (Secure Event Input)
  - `HIToolbox/TextInputSources.h` (TIS)
- Apple docs:
  - kAXBoundsForRangeParameterizedAttribute: https://developer.apple.com/documentation/applicationservices/kaxboundsforrangeparameterizedattribute
  - CGEvent.post(tap:): https://developer.apple.com/documentation/coregraphics/cgevent/post(tap:)
  - TN2150 "Using Secure Event Input Fairly": https://developer.apple.com/library/archive/technotes/tn2150/_index.html
  - Forums 726353 (DTS on secure input attribution): https://developer.apple.com/forums/thread/726353
  - Forums 659755 (AXEnhancedUserInterface side effects): https://developer.apple.com/forums/thread/659755
- Chromium:
  - accessibility design doc: https://www.chromium.org/developers/design-documents/accessibility/
  - `chrome/browser/chrome_browser_application_mac.mm`
  - `ui/accessibility/platform/browser_accessibility_cocoa.mm`
  - `ui/accessibility/ax_node_data.cc`
  - commit 34d5b59a "[Mac A11y Sonoma] Refine a11y detection and enablement on macOS Sonoma"
- Electron: `shell/browser/mac/electron_application.mm`; docs/tutorial/accessibility.md.
- WebKit: `Source/WebCore/accessibility/mac/WebAccessibilityObjectWrapperMac.mm`; `LayoutTests/accessibility/mac/content-editable-range-properties.html`.
- Behavioural evidence only (no code taken):
  - Starmel/OpenSuperWhisper `Utils/FocusUtils.swift` comments
  - Automattic/harper `mac_broker/accessibility_text.rs` comments
  - Clipy/Sauce `KeyboardLayout.swift` comments
  - p0deje/Maccy README and `docs/keyboard-shortcut-password-fields.md`
  - gnachman/iTerm2 `iTermTextViewAccessibilityHelper`
