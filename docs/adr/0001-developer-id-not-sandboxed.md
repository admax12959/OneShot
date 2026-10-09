# Ship outside the Mac App Store, notarized with Developer ID and not sandboxed

OneShot pastes into other apps with a synthesized ⌘V, reads and replaces selected text through Accessibility,
holds charging through a privileged background helper, and talks DDC/CI to external displays. The App Sandbox
blocks or cripples every one of these, so OneShot ships as a notarized Developer ID app without the sandbox and
never through the Mac App Store.

## Consequences

- No App Store review, distribution or in-app purchase. Updates need our own channel, and an updater is out of scope until an ADR allows one.
- Hardened runtime and notarization are mandatory. Every entitlement and every TCC permission (Accessibility, Screen Recording, background item) is requested explicitly and explained in the product.
