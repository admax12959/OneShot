# Research: native build, signing, notarization and CI

Ticket: admax12959/OneShot#21 (map #4). Written 2026-10-09 UTC (the first pass ran on the evening of 2026-10-08 MDT, which is the same UTC day). Revised 2026-10-09 UTC after independent review.

Given, not researched here:
- [ADR 0001](https://github.com/admax12959/OneShot/blob/wayfinder/native-shell-and-clipboard/docs/adr/0001-developer-id-not-sandboxed.md): Developer ID, notarized, hardened runtime, not sandboxed, no Mac App Store.
- The module layout from the [resolution of "What are the shell skeleton module boundaries and test seams?"](https://github.com/admax12959/OneShot/issues/13#issuecomment-6059929154), which is the primary source for it: `app/OneShot.xcodeproj` plus the local package `app/OneShotKit` (targets `Shell` and `Clipboard`), `swift test` with no host app, Swift 6, macOS 14 minimum, XCUITest deferred to this fog.

This note records facts and options. It decides nothing. Finishing it needed no paid account, credential, secret or signing run, and none was used.

## Sources and method

Access date convention: context citations (the Given section and this source list) inherit the date 2026-10-09 UTC. Every factual citation in the Facts sections repeats the date.

- Apple developer documentation was read as the JSON behind each page (`developer.apple.com/tutorials/data/documentation/...`). The citations use the human page URL. TN3127 was read as Markdown.
- Apple Developer Forums posts by Apple DTS engineers were read through a web fetch tool. They are Apple staff answers, not formal documentation, and each is labelled that way.
- Apple Support pages for the user and managed-Mac paths to Accessibility access were read through a web fetch tool.
- `actions/runner-images` README, image readmes, the TCC script `configure-tccdb-macos.sh` and issue 13518 were read from GitHub. The two readmes and the script were fetched twice and matched byte for byte.
- GitHub docs pages for hosted runners and runner pricing were read through a web fetch tool.
- Project documents are cited by exact link: issue resolution comments and the `research/*` branch notes.
- A background agent collected the first set of Apple pages and was stopped before it wrote anything. The author of this file read the pages and wrote the note.
- Only searched for keywords, not read in full: the Xcode release notes, "Resolving common notarization issues", "Generating Tokens for API Requests" and the Xcode build settings reference.
- Not found or not read, so claims that depend on them are labelled unverified: the `xcodebuild` and `notarytool` man pages, Apple documentation on how `CGEvent` posting is permission-gated, and any Apple text on `spctl` assessment.
- Nothing was built, signed, notarized or run. No credentials, accounts or `gh` write commands were used for this note.
- Labels. Unverified means no source I read says it. Inference means it follows from the sources cited next to it, but no source states it.

## Facts

### 1. Local build versus distribution

Distribution:
- Direct distribution means signing the code for distribution, putting it in a container, then notarizing the container. Developer ID signing is the route outside the Mac App Store. [Packaging Mac software for distribution](https://developer.apple.com/documentation/Xcode/packaging-mac-software-for-distribution), 2026-10-09.
- For an app built with Xcode, Apple's documented path is to archive, then export a distribution-signed app. It can be scripted as `xcodebuild archive` followed by `xcodebuild -exportArchive`, and the export options property list controls the export. Apple points to `xcodebuild -help` for its keys. [Creating distribution-signed code for macOS](https://developer.apple.com/documentation/Xcode/creating-distribution-signed-code-for-the-mac), 2026-10-09.
- A scripted export is shown as `xcodebuild -exportArchive -archivePath ... -exportOptionsPlist ... -exportPath ...`, then `ditto -c -k --keepParent` to make the ZIP that the notary service accepts. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09.
- Notarization needs a Developer ID certificate. Apple lists Mac Distribution, ad hoc, Apple Developer and local development certificates as not acceptable. [Notarizing macOS software before distribution](https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution), 2026-10-09.
- The same page requires valid signatures on all executables, hardened runtime enabled, a secure timestamp, no `com.apple.security.get-task-allow` set to true, and linking against the macOS 10.9 SDK or later. [Notarizing macOS software before distribution](https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution), 2026-10-09.
- For the Xcode organizer flow it says the Account Holder must sign the app with the Developer ID. [Notarizing macOS software before distribution](https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution), 2026-10-09.
- The build setting `ENABLE_HARDENED_RUNTIME` exists. [Build settings reference](https://developer.apple.com/documentation/Xcode/build-settings-reference), 2026-10-09.

Swift and tests:
- Swift 6 language mode arrived in Xcode 16 and is selected with `SWIFT_VERSION` or `-swift-version 6`. [Xcode 16 release notes](https://developer.apple.com/documentation/Xcode-Release-Notes/xcode-16-release-notes), 2026-10-09. In that mode `SWIFT_STRICT_CONCURRENCY` is always complete. [Build settings reference](https://developer.apple.com/documentation/Xcode/build-settings-reference), 2026-10-09.
- The Command Line Tools from Xcode 16.2 can run `swift test` for packages that use Swift Testing. [Xcode 16.2 release notes](https://developer.apple.com/documentation/Xcode-Release-Notes/xcode-16_2-release-notes), 2026-10-09.
- Inference: a macOS 14 deployment target can be built with a newer SDK, and a package with a macOS 14 platform floor can be tested on a macOS 15 or 26 host. Antecedents: the Xcode 16 and 26 release notes above and the image readmes in section 4. The `MACOSX_DEPLOYMENT_TARGET` entry was not found in the build settings page I read, and I did not run it.

### 1a. The local route that needs no certificate (reported separately)

What the sources say:
- Apple silicon code must be signed, and the linker applies an ad hoc signature automatically. An ad hoc signature is one with no associated certificate, and Xcode calls it Sign to Run Locally. Apple DTS engineer, accepted answer, July 2025. [Forums thread 791270](https://developer.apple.com/forums/thread/791270), 2026-10-09. The question there was about a command-line tool, so this shows the rule, not that any given app bundle launches.
- The same DTS engineer said earlier that all code on Apple silicon must be at least ad hoc signed, and that Sign to Run Locally is Xcode's name for ad hoc signing. November 2023. [Forums thread 740680](https://developer.apple.com/forums/thread/740680), 2026-10-09.
- Ad hoc signed code (Sign to Run Locally) has two drawbacks. It cannot use restricted entitlements (the post points to TN3125), and its identity is not stable, so it runs into TCC problems (the post points to TN3127). Apple DTS engineer, May 2024, footnote. [Forums thread 751658](https://developer.apple.com/forums/thread/751658), 2026-10-09.
- TN3127 agrees on identity: ad hoc code has a designated requirement tied to one specific build, so macOS cannot track its identity across builds. [TN3127](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements), 2026-10-09.
- Ad hoc signed code cannot be notarized. [Notarizing macOS software before distribution](https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution), 2026-10-09.

What follows (inference, from the five sources above):
- Inference: compiling and running `swift test` for the package needs no certificate and no paid account. On Apple silicon the linker applies an ad hoc signature on its own (threads 791270 and 740680 above), so the test executables are signed without any step from us. The exact package and test configuration is unknown, and no source I read covers `swift test` itself.
- Inference: an ad hoc signed local build is the documented way to run code that has no certificate on Apple silicon, so a developer with no Apple Developer Program membership can probably build and launch OneShot locally. Whether OneShot's own features work under ad hoc signing is unverified.
- Unverified: a build compiled with signing turned off is a different case. Whether such a product is left with no signature, or gets the linker's ad hoc signature on the main executable only, and whether the app then launches, is unverified. Treat compiled and launched as separate claims.
- Inference: what an ad hoc build cannot be assumed to do: keep an Accessibility grant across rebuilds (section 6), use any restricted entitlement, or pass notarization. Whether OneShot needs any restricted entitlement is unverified; section 2 found none documented.
- The exact `xcodebuild` flags for this route are unverified. No official source I read names them. The build settings page lists `CODE_SIGN_IDENTITY` (a missing or invalid certificate causes a build error) but I found no documented setting for an ad hoc identity or for turning signing off. Common practice (`CODE_SIGN_IDENTITY="-"`, `CODE_SIGNING_ALLOWED=NO`) is from memory, not from a source.
- Unverified: whether Sign to Run Locally in Xcode needs any account sign-in. TN3127 and the DTS posts describe an ad hoc signature as having no certificate, which suggests it does not, but none of them says so for the Xcode UI.

### 2. Hardened runtime and entitlements

- Hardened Runtime does not affect most apps and blocks a few less common capabilities such as JIT compilation. An app adds an entitlement only to switch off a specific protection, and Apple asks for only the ones that are necessary. Frameworks and in-process plug-ins inherit the host's entitlements. [Hardened Runtime](https://developer.apple.com/documentation/Security/hardened-runtime), 2026-10-09.
- Xcode puts an entitlement in the signature only when its value is true, and notarization requires the Hardened Runtime capability. [Hardened Runtime](https://developer.apple.com/documentation/Security/hardened-runtime), 2026-10-09.
- The pages for `AXIsProcessTrustedWithOptions`, `AXIsProcessTrusted`, `CGEvent.post(tap:)` and `SMAppService` (`mainApp`, `register()`) name no hardened-runtime entitlement. [AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions), [CGEvent post](https://developer.apple.com/documentation/CoreGraphics/CGEvent/post%28tap:%29), [SMAppService](https://developer.apple.com/documentation/ServiceManagement/SMAppService), [SMAppService.mainApp](https://developer.apple.com/documentation/ServiceManagement/SMAppService/mainApp), 2026-10-09. Inference: none of these needs a hardened-runtime exception. A page that does not mention one is not proof, so a first signed build on a clean Mac is the real test.
- Accessibility access for an app is granted by a person in System Settings under Privacy and Security, Accessibility. [Allow accessibility apps to access your Mac](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac), 2026-10-09. On managed Macs, a device management profile can grant Accessibility and PostEvent to specified apps. [Privacy Preferences Policy Control payload](https://support.apple.com/guide/deployment/privacy-preferences-policy-control-payload-dep38df53c2a/web), 2026-10-09. The AX trust check returns whether the process is a trusted accessibility client. [AXIsProcessTrusted](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted), 2026-10-09. Inference: Accessibility is a user-granted permission, not an entitlement. How Apple gates `CGEvent` posting is unverified in Apple docs; the project's own earlier research covers it (next bullet).
- Project findings on synthesized paste: the resolution of "How reliably can OneShot find the caret and paste into the frontmost app?" says paste is reliable where Accessibility trust exists. [Issue 8 resolution comment](https://github.com/admax12959/OneShot/issues/8#issuecomment-6057200168), 2026-10-09. Its research note, section 3.3, covers the AX trust check and the separate event-posting access check. [research/caret-and-paste.md](https://github.com/admax12959/OneShot/blob/research/caret-and-paste/research/caret-and-paste.md), 2026-10-09. These are project documents, not Apple sources.
- `SMAppService.mainApp` is the call that makes the main app launch at login, and registration is subject to user approval (error `kSMErrorLaunchDeniedByUser` if the user declines). [SMAppService.mainApp](https://developer.apple.com/documentation/ServiceManagement/SMAppService/mainApp) and [register()](https://developer.apple.com/documentation/ServiceManagement/SMAppService/register%28%29), 2026-10-09.
- GRDB and SQLite: I looked up no entitlement requirement. Unverified. Inference: none is needed because both are ordinary in-process code.
- KeyboardShortcuts uses Carbon `RegisterEventHotKey` for registration. [research/hotkeys.md](https://github.com/admax12959/OneShot/blob/research/hotkeys/research/hotkeys.md) and the [issue 7 resolution](https://github.com/admax12959/OneShot/issues/7#issuecomment-6057140838), 2026-10-09. No Apple source on entitlements for it was read. Unverified.
- App Sandbox entitlements are out of the picture under ADR 0001. [Entitlements](https://developer.apple.com/documentation/BundleResources/Entitlements), 2026-10-09, describes entitlements as key-value pairs embedded in the code signature.

### 3. Notarization

- `notarytool` replaced `altool`. The notary service stopped accepting `altool` and Xcode 13 or earlier uploads on 1 November 2023. [Notarizing macOS software before distribution](https://developer.apple.com/documentation/Security/notarizing-macos-software-before-distribution), 2026-10-09.
- Submit with `xcrun notarytool submit <file> --keychain-profile <profile> --wait`. `--wait` returns when processing ends. Fetch the log with `xcrun notarytool log <id> --keychain-profile <profile> <file>`, and Apple says to read it even when notarization succeeds. Processing typically takes under an hour. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09.
- The service takes ZIP archives, UDIF disk images and signed flat installer packages. An `.app` cannot be uploaded directly. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09. With nested containers, only the outermost one is notarized. [Packaging Mac software for distribution](https://developer.apple.com/documentation/Xcode/packaging-mac-software-for-distribution), 2026-10-09.
- Stapling uses `xcrun stapler staple` on an app, dmg or pkg. A ZIP cannot be stapled, so staple the items inside and re-zip. Standalone binaries cannot currently be stapled. Without a stapled ticket Gatekeeper may block a user who is offline. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow) and [Packaging Mac software for distribution](https://developer.apple.com/documentation/Xcode/packaging-mac-software-for-distribution), 2026-10-09.
- Authentication methods Apple documents for `notarytool`: (1) an Apple ID with an app-specific password, plus the team ID. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09. (2) An App Store Connect API key. The API keys page says Individual keys cannot be used with `notaryTool`, and that generating Team keys needs an Admin account. [Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/AppStoreConnectAPI/creating-api-keys-for-app-store-connect-api), 2026-10-09. Inference: a Team key is the API-key route. The `notarytool` options for a key are unverified, because I did not read the man page.
- A keychain profile is not a third way to authenticate. `xcrun notarytool store-credentials` saves credentials in the keychain under a name, and `--keychain-profile` refers to that saved entry. The documented example saves an Apple ID, team ID and app-specific password. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09. Whether a profile can hold an API key is unverified.
- Network access: by default `notarytool` uploads through Amazon S3 Transfer Acceleration (`notary-submissions-prod.s3-accelerate.amazonaws.com`), or with `--no-s3-acceleration` through `notary-submissions-prod.s3.us-west-2.amazonaws.com`. `stapler` uses CloudKit on port 443. [Customizing the notarization workflow](https://developer.apple.com/documentation/Security/customizing-the-notarization-workflow), 2026-10-09.
- `spctl` assessment of the result: unverified; none of the pages I read covers it.

### 4. GitHub-hosted macOS runners

Labels and images:
- Labels in the README: `macos-26` and `macos-latest` (arm64), `macos-26-intel` and `macos-26-large` (x64), `macos-15` (arm64), `macos-15-intel` and `macos-15-large` (x64), `macos-14` (arm64), `macos-14-large` (x64). The `-large` and `-xlarge` suffixes are larger runners. [actions/runner-images README](https://github.com/actions/runner-images/blob/main/README.md), 2026-10-09.
- The hosted-runner reference table for public repositories lists `macos-latest`, `macos-14`, `macos-15`, `macos-26` and `xcode-27` (public preview) as arm64, and `macos-15-intel` and `macos-26-intel` as Intel. [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), 2026-10-09.
- Images: `macos-26-arm64` is macOS 26.6.2 with Xcode 26.6 as default, down to 26.0.1 ([readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)). `macos-15-arm64` is macOS 15.7.9 with Xcode 16.4 as default and 26.0.1 to 26.3 also installed ([readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md)). `macos-14-arm64` is macOS 14.8.9 with Xcode 16.2 as the newest and 15.4 as default ([readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-14-arm64-Readme.md)). The `xcode-27` image is a public preview with macOS 27.0 and Xcode 27.0 default, plus 27.1 and a 27.2 beta ([readme](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md)). All read 2026-10-09. The readmes list SwiftFormat but no Swift compiler version, so toolchain versions are unconfirmed.
- Inference: Swift 6 mode with a macOS 14 deployment target can be compiled on `macos-15`, `macos-26` and, until retired, `macos-14`. Antecedents: Swift 6 mode arrives in Xcode 16 (section 1), and every image above has an Xcode 16 or later.

macOS 14 retirement:
- The issue opened 11 January 2026 states deprecation begins 6 July 2026 and the macOS 14 images are fully unsupported by 2 November 2026 for GitHub Actions and Azure DevOps. It also lists brownout windows in October, each from 14:00 UTC to 00:00 UTC the next day, during which macOS 14 jobs fail. The page gives no year for the brownouts. [actions/runner-images issue 13518](https://github.com/actions/runner-images/issues/13518), 2026-10-09.
- Inference: after 2 November 2026 no hosted image runs macOS 14. A hosted job could still compile for a macOS 14 target, but it could not run tests on macOS 14. Antecedents: the issue above and the image list above (15, 26 and the 27 preview remain).

Cost:
- Use of the standard GitHub-hosted runners is free and unlimited on public repositories. [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), 2026-10-09. This repository is public ([repository metadata](https://api.github.com/repos/admax12959/OneShot), field `visibility`, 2026-10-09). So standard runners, meaning the labels in the public-repository table above, cost nothing here today. The `-large` and `-xlarge` labels are larger runners, which the pricing page says are not free for public repositories and cannot use included minutes. [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing), 2026-10-09.
- Listed rates on that page: standard macOS 3-core or 4-core $0.062 per minute, 12-core $0.077, 5-core M2 Pro $0.102. [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing), 2026-10-09. For a private repository, standard runners first use the account's free minute allotment and are then charged at the per-minute rates; the page does not say how many free minutes there are. [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), 2026-10-09. Larger runners are charged at these rates even in a public repository.

Secrets and permissions:
- A job that compiles and runs `swift test` needs no Apple credentials. That has not been shown end to end here: the build configuration (section 1a) and a working workflow for it are unverified.
- The existing workflow file [check.yml](https://github.com/admax12959/OneShot/blob/wayfinder/native-shell-and-clipboard/.github/workflows/check.yml) (merged commit 134a7fc, read 2026-10-09) triggers on `push` and `pull_request`, sets `permissions: contents: read`, references no secrets and does not use `pull_request_target`. It runs on `ubuntu-latest`, so a macOS job would be a new job, not a change to a setting. Its history is [issue 19](https://github.com/admax12959/OneShot/issues/19) and [PR 20](https://github.com/admax12959/OneShot/pull/20), 2026-10-09. No native workflow exists yet.
- That secrets are withheld from workflows triggered by fork pull requests is unverified, because I did not read GitHub's page on it. The existing workflow does not use `pull_request_target` (see the check.yml bullet above).

### 5. XCUITest on hosted runners

The ticket's phrase "TCC permissions cannot be granted there" was a hypothesis. The evidence splits four ways. Nothing in the first two answers whether OneShot's tests would pass on a hosted runner.

- Apple-supported grant paths, on a Mac in general. A person turns the app on in System Settings, Privacy and Security, Accessibility. [Allow accessibility apps to access your Mac](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac), 2026-10-09. On a managed Mac, a Privacy Preferences Policy Control profile can allow named apps to use the Accessibility and PostEvent services. It needs a device management service, and the page lists supervision and user approval as requirements. A custom entry needs the app's code signing requirement. [Privacy Preferences Policy Control payload](https://support.apple.com/guide/deployment/privacy-preferences-policy-control-payload-dep38df53c2a/web), 2026-10-09. These pages say nothing about hosted CI VMs.
- What GitHub's image script shows. `configure-tccdb-macos.sh` inserts rows into the system and user TCC databases when the image is built. The `kTCCServiceAccessibility` rows name `/bin/bash`, `/usr/bin/osascript`, `com.apple.Terminal`, `com.apple.dt.Xcode-Helper`, `/usr/libexec/sshd-keygen-wrapper` and the runner provisioner scripts. There are also rows for PostEvent, ScreenCapture, AppleEvents and SystemPolicyAllFiles. A comment in the script says an alert "takes focus and breaks headed UI tests". [configure-tccdb-macos.sh](https://github.com/actions/runner-images/blob/main/images/macos/scripts/build/configure-tccdb-macos.sh), 2026-10-09. This shows that the hosted images ship with some pre-set grants, so "cannot be granted at all" is not supported as a general claim. It does not show that those rows cover a OneShot app or its test runner, and it is GitHub's image policy, not an Apple-supported grant path.
- XCUITest of OneShot's own UI on a hosted runner. Unknown. I found no source that says a macOS XCUITest bundle passes there or fails there, and I did not try one.
- Cross-app Accessibility use (reading a caret in another app, synthesizing paste into it) on a hosted runner. Unknown and untried. It would need OneShot or its test runner to be trusted and a target app on the VM. The physical-Mac side is the open ticket ["Spike caret placement and paste in real apps"](https://github.com/admax12959/OneShot/issues/16), which stays out of scope. Project record, 2026-10-09.
- Unverified: adding a TCC row at job time on a hosted VM. No source I read documents it as supported, and I did not try it.

### 6. TCC and code signature

- macOS identifies code by its designated requirement (DR), the rule it uses to recognise the same code later. [TN3127](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements), 2026-10-09.
- Unsigned code has no DR. Ad hoc code has a DR bound to one build. TN3127 says macOS therefore cannot track a privacy grant across builds of such an app, and its worked example is microphone access. [TN3127](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements), 2026-10-09. An Apple DTS engineer repeats this for Sign to Run Locally: the identity is not stable, so it runs into TCC problems. [Forums thread 751658](https://developer.apple.com/forums/thread/751658), 2026-10-09.
- TN3127 separates two kinds of DR. Plain `codesign` gives a default DR based on the signing identity. A development build and a Developer ID build get different DRs, and the Mac App Store and Developer ID variants of an app are not mutually compatible. The default DR does let a new version signed the same way by the same team keep a privilege earlier versions got. Xcode instead signs App Store and Developer ID builds with custom DRs that make those two variants mutually compatible, so a grant made to one carries to the other. [TN3127](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements), 2026-10-09.
- TN3127 also says an Apple Development DR is very different from the Developer ID and App Store DRs. An app that satisfies one does not satisfy the others, so the system prompts again when a Developer ID or App Store variant uses a resource the development variant was granted (its example is the microphone). [TN3127](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements), 2026-10-09. That is TN3127's documented general rule, shown with its microphone example. For Accessibility on OneShot it carries over only as an inference (next bullet): Xcode's custom DRs link only the App Store and Developer ID variants, so a development build and a release build might not share a grant.
- TN3127's example is the microphone, not Accessibility. How the Accessibility grant behaves is unverified. Inference, from the three bullets above: if Accessibility is tracked the same way, an ad hoc rebuild is asked again each time, and rebuilds that keep one stable DR (for example the same Apple Development identity and bundle identifier) might keep the grant. That depends on the new build satisfying the DR stored with the old grant. The same team and bundle identifier alone do not guarantee it. On certificates without the paid program: an Apple DTS reply says that a person who is not a paid Program member can use any Apple ID as a free Personal Team. [Forums thread 740680](https://developer.apple.com/forums/thread/740680), November 2023, 2026-10-09. The independent reviewer read this passage; my own fetch of that thread did not capture it. This is a third route, distinct from ad hoc signing: a Personal Team needs an Apple ID signed in to Xcode and yields an Apple Development identity, while ad hoc signing needs no account and no certificate. That a Personal Team identity keeps a stable designated requirement, and that an Accessibility grant then persists across rebuilds, are both unproven.
- The earlier project research says synthesized paste needs Accessibility trust, so this affects any local loop for the float and paste work. [Issue 8 resolution comment](https://github.com/admax12959/OneShot/issues/8#issuecomment-6057200168) and [research/caret-and-paste.md](https://github.com/admax12959/OneShot/blob/research/caret-and-paste/research/caret-and-paste.md), 2026-10-09.

## Answers to the six scope questions

1. Local build versus distribution. Answered for distribution (archive, export, Developer ID, hardened runtime, notarization requirements). Partly answered for the local no-certificate route: ad hoc signing and the Apple silicon signing rule are sourced (section 1a), but the exact `xcodebuild` flags and whether a given build launches are unverified.
2. Entitlements. Partly answered. No documented hardened-runtime entitlement is needed for the APIs checked (inference). Accessibility and PostEvent are user-granted permissions. GRDB, KeyboardShortcuts and `CGEvent` gating are unverified in Apple docs.
3. Notarization. Answered for the documented flow and the two documented authentication methods, with the keychain profile described as stored credentials. `notarytool` option names for an API key and `spctl` are unverified.
4. Hosted macOS runners. Answered with sources: labels, images, Xcode versions, macOS 14 retirement on 2 November 2026, and free standard runners for this public repository. A working zero-secret workflow is unverified.
5. XCUITest on hosted runners. Unknown for OneShot. Documented: Apple's grant paths on a Mac, and GitHub's image script rows. Not shown: any XCUITest or cross-app Accessibility run on a hosted runner.
6. TCC and code signature. Answered for the general rule (ad hoc is unstable, Developer ID and App Store are linked by Xcode, Apple Development is not). Accessibility specifically is inference.

## Local runnable route versus release route

| Local development, no certificate | Release, Developer ID path |
| --- | --- |
| Ad hoc signing (Sign to Run Locally) is how Apple silicon runs code with no certificate. Sourced in section 1a. | A Developer ID Application certificate, signed by the Account Holder in Apple's Xcode flow. |
| `swift test` for `OneShotKit` (Swift Testing, Command Line Tools from Xcode 16.2). No certificate expected (inference); exact configuration unknown. | `xcodebuild archive`, then `-exportArchive` with an export options plist. |
| Compiling the app target in Swift 6 mode (Xcode 16 or later). Exact flags for an unsigned or ad hoc build are unverified. | Hardened runtime on, secure timestamp, no `get-task-allow`. |
| Zero-secret CI that compiles and runs `swift test`. Not shown end to end. | `notarytool submit --wait` with an Apple ID and app-specific password, or a Team API key from an Admin. |
| Accessibility may need re-granting after each ad hoc rebuild. Inference, unverified for Accessibility. | Staple the ticket to the app, dmg or pkg. A ZIP cannot be stapled. |
| | A Mac with network access to the notary endpoints. |

A compiled build and a launched app are different claims. Hosted runners cannot run macOS 14 after 2 November 2026 (section 4).

## Credible options

Options only. Each lists its constraints.

1. Compile-and-test CI with no secrets, on a standard `macos-26` or `macos-15` arm64 runner: `swift test` for `OneShotKit`, plus an unsigned or ad hoc `xcodebuild build` of the app target. Constraints: flags, workflow and end-to-end result are unverified; it shows compilation and unit tests, not that the app launches; no macOS 14 runtime after 2 November 2026; standard runners are free for this public repository today.
2. Signed and notarized release job in CI. Archive, export with Developer ID, zip or dmg, `notarytool submit --wait`, staple. Constraints: needs the certificate and a notarization credential inside the job; needs Account Holder or Admin assets; `get-task-allow` must be absent.
3. Signed and notarized release done on the owner's Mac, with CI left at option 1. Constraint: manual, but nothing sensitive in GitHub.
4. Local development with ad hoc signing. Constraints: Accessibility may need re-granting after rebuilds, no restricted entitlements, no notarization.
5. XCUITest for the app's own UI. (a) Run it nowhere and use `swift test` plus the manual checklist chosen in ticket 13. (b) A bounded, separately approved trial on a hosted runner, starting from the grants in `configure-tccdb-macos.sh`; the outcome is unknown. (c) Run it on the owner's Mac or a self-hosted Mac, where a person gives the grants. Constraint: no source shows a macOS XCUITest bundle passing on a hosted runner.
6. A macOS 14 runtime check on a local or self-hosted Mac, once the hosted macOS 14 image is gone.

## Recommendation (non-binding)

This is input for a later grilling with the human, not a decision. None of it turns an unverified item above into a fact.

- Option 1 is the cheapest place to start and matches the existing least-privilege workflow. Treat it as a hypothesis to try: nobody has run the configuration, and a green run would still prove only compilation and unit tests.
- Keep signing and notarization (options 2 and 3) as a separate step. Apple's notarization page requires a Developer ID certificate, so a real notarization cannot be rehearsed without one.
- Do not make XCUITest a gate. If it is wanted, option 5(b) is a bounded way to find out, since the evidence is only that hosted images ship some pre-set grants.
- Plan the macOS 14 runtime check (option 6) as local or manual.
- For the local loop, a stable signing identity for debug builds is worth trying because it might keep the Accessibility grant across rebuilds. That rests on TN3127's microphone example and is unproven for Accessibility and for any particular identity.

## Open for the human

None of these is answered here.

- Does OneShot get Apple Developer Program membership, and under whose team? The Developer ID certificate page says creating one needs the Account Holder role (cloud-managed certificates are open to some Admins) and that new Developer ID certificates need Program membership. [Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/), 2026-10-09. Whether that membership is the paid program is not stated on that page; I treat it as paid by inference. No team is named in this note.
- Do signing certificates or notarization credentials ever live in GitHub secrets, or does release stay on the owner's Mac?
- Which notarization authentication method: Apple ID with app-specific password, or a Team API key made by an Admin?
- Release trigger and artifact form (tag or manual run, dmg or zip), and where it is published.
- Is a macOS 14 runtime check required before a release, given the hosted image goes away on 2 November 2026?
- Does XCUITest run anywhere, and may a trial touch hosted-runner Accessibility rows?
- Which stable signing identity is used for local debug builds, and is an Apple Development certificate acceptable for that?
- If the repository becomes private, is the listed per-minute rate acceptable?

## Acceptance status for ticket 21

1. One Markdown file on branch `research/native-build-signing-ci`: met. The ticket text said "local only". Publication was later authorized separately, and the branch is pushed and open as [draft PR 22](https://github.com/admax12959/OneShot/pull/22), 2026-10-09. The PR is not merged and the ticket is open.
2. Every factual claim cites a primary source with exact URL and access date: met. All dates are 2026-10-09 UTC. Forum posts are Apple DTS answers and project links are project documents; both are labelled. An independent manual review against the cached primary pages was completed on 2026-10-09 UTC.
3. Separate sections for facts, options, recommendation and open questions: met.
4. Unverifiable or version-sensitive claims labelled: met. See the unverified and inference labels.
5. No decision language, no secrets or identifiers: met. The structural checker (a separate script, reported with this note) covers this pattern-wise only, and the independent manual read completed on 2026-10-09 UTC. The checker's PASS stays a structural result, not a semantic one.
6. Independent review before the ticket closes: completed on 2026-10-09 UTC (manual, by the reviewer). Nothing here was validated by a native build, signing or notarization run. The ticket stays open on explicit authorization.

Local review results and CI results are different evidence. Local: the structural checker and its self-test passed, `node scripts/check.mjs` passed, and the manual review above was done. CI: the repository's existing `check` job runs on the pull request, and its results are on [PR 22](https://github.com/admax12959/OneShot/pull/22). That job runs the prototype artifact checks and does not read this note's claims, so a green CI result says nothing about the research conclusions.

## Process evidence

Method: skill files were read as text and were not invoked through the Skill tool. The commands were these.
- File reader on `~/.claude/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/wayfinder/SKILL.md`.
- Shell `cat` of `.../skills/engineering/research/SKILL.md` in the same plugin directory.
- File reader on `.../skills/productivity/grilling/SKILL.md` and `.../skills/engineering/domain-modeling/SKILL.md`.
- File reader on `~/.codex/plugins/cache/openai-curated-remote/pstack-plugin/0.2.0/skills/principle-prove-it-works/SKILL.md` and then on `.../skills/unslop/SKILL.md`.
- Wayfinder `SKILL.md` and research `SKILL.md` (Matt Pocock skills 1.3.1): read in full. The research skill's background-agent step was run once and the agent was then stopped.
- Grilling and domain-modeling `SKILL.md`: read in full. This is an AFK research ticket, so no grilling with the human took place.
- pstack `principle-prove-it-works` and `unslop`, from the Codex pstack plugin 0.2.0: read in full. The prove-it-works rule is why the structural checker and its negative fixtures exist. The unslop rules shaped this revision (no em dashes, plain words).
- Repo documents read: `AGENTS.md`, the three files in `docs/agents`, `GLOSSARY.md`, ADR 0001, the live map (issue 4), issues 13, 19 and 16, and the `research/*` notes cited above. ADRs 0002 and 0003 were not read.
- No other skills or pstack skills were read.
