# Keep history stores in GRDB (SQLite), settings in UserDefaults

Clipboard history (and later Screenshot history) lives in one SQLite file per feature, accessed through GRDB
(MIT, no transitive dependencies) from a repository actor that feeds `@MainActor @Observable` stores through
ValueObservation. Settings and hotkeys live in UserDefaults; later singleton documents (JSON Studio, Vault
metadata) are atomic Codable files. We rejected SwiftData because its `@Model` classes aren't Sendable, which
forces a DTO layer anyway, and its background-context and autosave bugs on macOS 14–15 sit exactly on our
actor boundary. We rejected Codable files for history because every save rewrites the whole history and they
offer no transactions for insert-and-prune.

## Consequences

- GRDB is the map's first third-party dependency and needs Swift 6.1+ (Xcode 16.3+).
- Image clip bytes are files beside the database, owned by the clip and deleted only after the database commits; a launch sweep removes orphans. Image clips no longer reference Screenshot shots as the prototype did.
- Migrations are forward-only and never edited once shipped; downgrades are unsupported and surface as the store's failure state, never as an automatic rebuild.
- No app-level encryption: history relies on FileVault and owner-only file permissions.
