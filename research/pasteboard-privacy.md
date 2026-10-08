# Pasteboard privacy on macOS 15.4+ and its effect on clipboard watching

Research for [#5](https://github.com/admax12959/OneShot/issues/5) (map [#4](https://github.com/admax12959/OneShot/issues/4)). Researched 2026-10-08.

Each claim is tagged with its source. **[unverified]** means no first-party Apple source states it; treat it as an assumption to test on hardware.

## Sources

- **[AK-UPD]** Apple, *AppKit updates*, section "April 2025 > macOS pasteboard privacy". https://developer.apple.com/documentation/updates/appkit#macOS-pasteboard-privacy
- **[HDR]** `AppKit.framework/Headers/NSPasteboard.h`, macOS 15.5 SDK (Command Line Tools), lines 52-70, 169-170, 242-276.
- **[DOC-AB]** `NSPasteboard.accessBehavior`. https://developer.apple.com/documentation/appkit/nspasteboard/accessbehavior-86972
- **[DOC-ENUM]** `NSPasteboard.AccessBehavior` and its cases `.default`, `.ask`, `.alwaysAllow`, `.alwaysDeny`. https://developer.apple.com/documentation/appkit/nspasteboard/accessbehavior-swift.enum
- **[DOC-DETECT]** `detectedPatterns(for:)`, `detectedMetadata(for:)`, `detectedValues(for:)` on `NSPasteboard` and `NSPasteboardItem`. https://developer.apple.com/documentation/appkit/nspasteboard/detectedpatterns(for:)
- **[DOC-CC]** `NSPasteboard.changeCount`. https://developer.apple.com/documentation/appkit/nspasteboard/changecount
- **[UIPB]** `UIPasteboard` overview, the iOS model Apple names as the analogue. https://developer.apple.com/documentation/uikit/uipasteboard
- **[RN-27.2]** *macOS 27.2 release notes*, AppKit > Deprecations (186955507). https://developer.apple.com/documentation/macos-release-notes/macos-27_2-release-notes
- **[RN-OTHER]** macOS 15.4, 15.5, 15.6, 26, 26.1-26.6 and 27 release notes. None mentions the pasteboard or clipboard (checked by full-text search of each page's JSON).
- **[FORUM]** Apple Developer Forums thread 794560, "No MDM settings to control macOS pasteboard privacy?" (July 2025). The DTS reply only asks for an enhancement request. https://developer.apple.com/forums/thread/794560

## 1. What the feature is

- In April 2025 Apple announced "an upcoming feature in macOS that alerts a person using a device when your app programmatically reads the general pasteboard." **[AK-UPD]**
- "The system shows the alert only if the pasteboard access wasn't a result of someone's input on a UI element that the system considers paste-related. This behavior is similar to how `UIPasteboard` behaves in iOS." **[AK-UPD]**
- The APIs shipped in macOS 15.4 (`API_AVAILABLE(macos(15.4))`). **[HDR]**
- For testing, developers could opt one app in with `defaults write <bundle_id> EnablePasteboardPrivacyDeveloperPreview -bool yes`. **[AK-UPD]**

## 2. Shipping status

- None of the release notes for macOS 15.4-15.6, 26.0-26.6 or 27.0 announces that the alert is on by default. **[RN-OTHER]**
- macOS 27.2 (beta 3 notes): "The `EnablePasteboardPrivacyDeveloperPreview` user default has been removed. (186955507)" **[RN-27.2]**
- **[unverified]** What that removal means. Either the behaviour is now on for everyone in 27.2, or the preview was withdrawn. Apple has not said which. Secondary reports (not Apple) say the feature was not active by default in macOS 26.
- **[unverified]** Whether enforcement depends on the SDK the app links against, or applies to every app whatever its SDK. Apple has not said.

## 3. What is gated

Apple states that these are gated:

- **Programmatic reads of the general pasteboard's contents.** This covers `string(forType:)`, `data(forType:)`, `readObjects(forClasses:options:)` and the like. **[AK-UPD]**
- **Only the general pasteboard.** "All other pasteboards default to always allow access." **[DOC-ENUM `.default`]**
- **`detectedValues(for:)` / `detectValuesForPatterns:`.** "If a match is found, the system informs the person using the app that the app is trying to read the contents of the pasteboard. If the person denies access to the pasteboard, the method throws an error." **[DOC-DETECT]**, **[HDR]**

Apple states that these are not gated:

- **`detectedPatterns(for:)` and `detectedMetadata(for:)`.** These run "without notifying the person using the app", because they do not expose contents. **[DOC-DETECT]**, **[HDR]** Patterns cover probable web URL, probable web search, number, link, phone number, email, postal address, calendar event, shipment tracking, flight number and money amount. The only metadata type is `contentType`, the UTType of a file URL. **[HDR]**
- **Reads that are "both user originated and paste related"** are always allowed. This holds even under `.alwaysDeny`, and no notification appears. **[DOC-ENUM `.ask`/`.alwaysDeny`]**

Not stated for macOS:

- **[unverified]** That `changeCount`, `types`, `pasteboardItems[i].types`, `availableType(from:)` and `canReadObject(forClasses:)` stay ungated. The NSPasteboard docs and header say nothing either way. On iOS, Apple explicitly lists `types`, `numberOfItems`, the `has*` properties and `canLoadObject` as not notifying **[UIPB]**, and Apple calls the macOS behaviour "similar" **[AK-UPD]**. Reading those as ungated on macOS is an inference. `changeCount` is a plain integer that counts ownership changes **[DOC-CC]**, and nothing documents it as gated.

## 4. Detecting the state

`NSPasteboard.general.accessBehavior` is a read-only property, available on macOS 15.4+. **[DOC-AB]**, **[HDR]**

| Value | Meaning (Apple's wording, condensed) |
|---|---|
| `.default` (0) | The app has never triggered an alert. For the general pasteboard this behaves as "ask upon programmatic access", and the app is not listed in System Settings. **[DOC-ENUM]** |
| `.ask` (1) | Set automatically after the first alert. The system asks before granting access, except for user-originated paste. The app is listed in System Settings. **[DOC-ENUM]** |
| `.alwaysAllow` (2) | All access is allowed without notification. **[DOC-ENUM]** |
| `.alwaysDeny` (3) | All access is denied without notification, except for user-originated paste. **[DOC-ENUM]** |

- The user changes the value per app in System Settings, and only for apps that have already triggered an alert. **[DOC-AB]**
- **[unverified]** The System Settings pane's name and location. Apple says only "the corresponding System Settings pane".
- No API requests permission ahead of time. The only way to prompt is a gated read. **[HDR]**: the property is readonly and no request method exists.
- The Swift declaration is `@objc dynamic var accessBehavior`. **[DOC-AB]** **[unverified]** Whether the property actually posts KVO notifications when the user changes the setting. Plan to re-read it, for example on app activation.
- **[unverified]** Whether `.default` behaves as ask when the developer-preview default is off on macOS 15.4-26. All the evidence above suggests no alert appears in that case.

## 5. The prompt

- It is an alert, per Apple's own word **[AK-UPD]**. On first trigger it moves the state from `.default` to `.ask`. **[DOC-ENUM]**
- It fires on a programmatic read of the general pasteboard's contents that does not come from paste-related UI input. **[AK-UPD]**
- **[unverified]** The exact wording, the buttons, and whether a choice in the alert persists (switches to allow/deny) or applies to that one access only. Third-party reports quote "\<App\> is trying to access the pasteboard". No Apple source shows the alert.
- **[unverified]** What a denied synchronous read returns, such as `nil` from `string(forType:)` or an empty `pasteboardItems`. Apple documents an error only for the async `detectedValues`.
- **[FORUM]** No MDM / PPPC payload controls this; a DTS engineer pointed to an enhancement request (July 2025).

## 6. What clipboard-history apps do

This research does not cover it. The ticket limits sources to Apple, and Apple publishes no guidance for clipboard managers. Apple's only statement is the general one above: adopt the `detect` APIs and check `accessBehavior` **[AK-UPD]**.

## 7. Implications for OneShot's watcher

Context: minimum macOS 14, Developer ID, not sandboxed (ADR 0001).

1. **The gate is a runtime check, not an entitlement.** Nothing in Apple's material ties it to the sandbox or to an entitlement or Info.plist key **[AK-UPD]**, **[HDR]**. **[unverified]** Whether being unsandboxed changes anything.
2. **A polling watcher is the exact case the gate targets.** It compares `changeCount` and then reads the new contents with no user paste action, so every capture is a "programmatic read". Under `.default`/`.ask` with enforcement on, the first capture triggers an alert. Under `.alwaysDeny`, captures fail silently.
3. **Polling `changeCount` is probably safe; reading contents is not.** Gate the content read, not the poll. Using `types` to classify a clip before reading it (concealed or transient markers, file URLs) is probably safe too. This is **[unverified]** for macOS (see section 3).
4. **The permissions model needs a "Clipboard access" state** next to Accessibility, mapped from `accessBehavior`: `.alwaysAllow` → granted; `.ask`/`.default` → will prompt; `.alwaysDeny` → blocked, so show a fix-it pointing to System Settings. On macOS 14 – 15.3 the property does not exist, so treat access as granted (`if #available(macOS 15.4, *)`).
5. **The first prompt should come from a deliberate moment.** The app cannot request access ahead of time, so onboarding should do one read the user expects, for example "Start watching", to trigger the alert. The first silent background capture should not be the trigger.
6. **Re-read `accessBehavior` when the app becomes active and before each read.** Do not rely on KVO alone (**[unverified]**).
7. **Pasting from OneShot back into another app writes to the pasteboard; it does not read.** Writes are not described as gated **[AK-UPD]**, so the paste-out path is unaffected.

## Open questions to settle on hardware (macOS 27.2+)

- Is the alert enforced by default once the preview default is removed?
- Do `changeCount` and `types` stay alert-free?
- What does a denied `string(forType:)` / `pasteboardItems` return?
- Does the alert's choice persist?
- Does `accessBehavior` post KVO?
- Is enforcement tied to the linked SDK?
