# Storage engine for OneShot stores on macOS 14: SwiftData vs GRDB/SQLite vs Codable files

Ticket: admax12959/OneShot#6 (map #4). Researched 2026-10-08.
Status legend: **[V]** verified against a primary source fetched this session; **[S]** secondary or forum evidence; **[U]** unverified, from general knowledge or reasoning.

## Question

Which of SwiftData, GRDB (SQLite) or plain Codable files fits these OneShot stores: Clipboard history (up to 1,000 clips plus image files), later Screenshot history, JSON documents and Vault metadata? Criteria: macOS 14 maturity, use from a background actor beside `@MainActor @Observable` stores, migrations, query speed at 1,000 to 10,000 rows, testability (in-memory), crash safety, licence, dependency weight.

Context from the product contract (prototype-v3 SPEC): every `OS.commit` is saved, coalesced and flushed on quit. The Clipboard keeps `limit` (default 50) unpinned clips and prunes the rest, with the history flag up to 1,000. Clips are `{id, kind, text, image?, source, pinned, at}`. The access pattern is append, prune, filter-as-you-type, and a single user on one machine. There is no sync and no multi-process access.

## Findings

### SwiftData

- **Availability.** `ModelActor` is macOS 14.0+, Swift 5.9+. It is a protocol refining `Actor`. Its `modelContext` is "the context that serializes any code running on the model actor". [V] https://developer.apple.com/documentation/swiftdata/modelactor.md
- **Migrations.** `SchemaMigrationPlan` and `VersionedSchema`, with `MigrationStage`, are macOS 14.0+. [V] https://developer.apple.com/documentation/swiftdata/schemamigrationplan.md
- **In-memory.** `ModelConfiguration.isStoredInMemoryOnly` is macOS 14.0+ and is the standard route for tests and previews. [V via search-result summary of Apple's page] https://developer.apple.com/documentation/swiftdata/modelconfiguration/isstoredinmemoryonly.md
- **Known problems on the 14 to 15 era**, all from Apple Developer Forums and so [S]:
  - A `ModelActor` initialised on the main thread gets a main-queue context. A search summary attributes this to FB13399899. The underlying thread was not opened, so treat the report number as unverified. https://developer.apple.com/forums/thread/736226 (listed in search results, not read)
  - Changes saved by a background `ModelActor` context were not merged or propagated to the main context or `@Query` on iOS 17, reportedly fixed in iOS 18 betas, and unreliable in the simulator. https://developer.apple.com/forums/thread/762183 and https://developer.apple.com/forums/thread/767081
  - A background `ModelActor` context with `autosaveEnabled = true` crashed on a macOS 14.6.1 app when it moved to the background. A community reply attributes it to a bug "around iOS 17.4". Turning autosave off and saving manually avoided it. https://developer.apple.com/forums/thread/761637
  - Apple DTS (Ziqiao Chen) on thread 770416: don't wrap `ModelContainer.mainContext` in a `ModelActor`, because it is already `@MainActor`. Use a `@MainActor` type instead. Reports of multi-window `ModelActor` crashes persisted on macOS 15.1. https://developer.apple.com/forums/thread/770416
- **Fit with our architecture.** `@Model` classes are not `Sendable`, so they cannot cross the actor boundary. Only `PersistentIdentifier` and value snapshots can. We would need a DTO layer anyway to feed `@MainActor @Observable` stores. [U, from the type design, not from a fetched statement]
- **Query limits.** `#Predicate` supports a restricted expression set. [U: the Apple page 404'd in this session, so the limits were not checked.] Filter-as-you-type over text content would need verification in a spike.
- **Storage.** It is built on Core Data and SQLite. [U: not fetched. The Core Data mechanics visible in the forum stack traces, such as `NSManagedObjectContext` notifications, support it.]
- **Licence and weight.** First-party, no dependency, no licence concern. [V by nature]

### GRDB (SQLite)

- **Licence.** MIT, "Copyright (C) 2015-2025 Gwendal Roué". [V] https://raw.githubusercontent.com/groue/GRDB.swift/master/LICENSE
- **Version and OS floor.** Latest release v7.11.1 (about 3 months before research date) per the Swift Package Index. README and `Package.swift` say iOS 13+ / macOS 10.15+, SQLite 3.20+, and **Swift 6.1+ / Xcode 16.3+** to build (`swift-tools-version: 6.1`, Swift 6 language mode). macOS 14 is well above the runtime floor. The toolchain floor is a project constraint to note. [V] https://github.com/groue/GRDB.swift, https://swiftpackageindex.com/groue/GRDB.swift, https://raw.githubusercontent.com/groue/GRDB.swift/master/Package.swift
- **Dependencies.** None by default. `swift-docc-plugin` is pulled only for documentation builds. SQLCipher is an opt-in, commented-out option. It links the system SQLite on Apple platforms and compiles with FTS5 enabled (`SQLITE_ENABLE_FTS5`). [V, same sources]
- **Concurrency.** `DatabaseQueue` "opens a single database connection, and serializes all database accesses". `DatabasePool` "allows concurrent reads and writes thanks to the WAL mode". Async access "does not block the current thread" and honours task cancellation. The README shows `observation.values(in: dbQueue)` as an `AsyncSequence` (Swift concurrency). Records are plain value types (structs), so there is no actor-isolation problem with `@MainActor @Observable` stores. [V] https://raw.githubusercontent.com/groue/GRDB.swift/master/GRDB/Documentation.docc/Concurrency.md
- **Migrations.** `DatabaseMigrator` with named, ordered migrations. "A good migration is a migration that is never modified once it has shipped." `eraseDatabaseOnSchemaChange` is development-only ("can destroy your precious users' data!"). Foreign keys are checked around migrations. [V] https://raw.githubusercontent.com/groue/GRDB.swift/master/GRDB/Documentation.docc/Migrations.md
- **Testability.** In-memory `DatabaseQueue` is supported. The demo apps share DB code between the on-disk pool and an in-memory queue used in tests. [V, Concurrency.md and README]
- **Observation.** `ValueObservation` gives change notifications, which can feed the `@Observable` stores. [V, README]
- **Crash safety.** SQLite transactions are atomic and durable, and WAL is the mode `DatabasePool` uses. [U: sqlite.org was not fetched this session. This is standard SQLite behaviour and should be confirmed against https://www.sqlite.org/atomiccommit.html and https://www.sqlite.org/wal.html.]
- **Query speed.** Indexed or `LIKE`/FTS5 queries over 1k to 10k rows are expected to be effectively instant. [U: no benchmark was run. FTS5 availability is [V] from `Package.swift`.]
- **Maintenance risk.** Single maintainer, but 11 years of history, about 8.7k stars and active releases. [V, GitHub and SPI pages]

### Codable files (JSON or plist)

- **Fit.** Suits small, whole-document state: preferences, JSON Studio documents, Vault metadata with few entries. [U, reasoning]
- **Crash safety.** Atomic replace (`Data.write(to:options: .atomic)` or write-to-temp then rename) protects against torn files. [U: Apple docs not fetched.]
- **Costs at the 1,000 to 10,000 row scale.** The whole collection is rewritten on each commit unless sharded per item. Filtering is an in-memory scan, which is fine at these sizes. Migrations are hand-written, version-tagged decode paths. There is no query layer, no transactions across files, and image sidecars need their own orphan cleanup. [U, reasoning]
- **Testability.** Trivial (temp directory, or an in-memory protocol implementation). **Licence and weight:** none, Foundation only. [V by nature]

## Comparison

| Criterion | SwiftData | GRDB | Codable files |
|---|---|---|---|
| macOS 14 maturity | Present from 14.0 but with documented background-context and autosave bugs on 14/15 [S] | Mature, 11 years, runtime floor 10.15 [V]. Needs Swift 6.1 / Xcode 16.3 toolchain [V] | Foundation, no maturity risk [U] |
| Background actor + `@MainActor @Observable` | `@Model` is not `Sendable`, so a DTO layer is needed, and merge and autosave bugs are reported [S/U] | Value-type records, async API, queue/pool serialisation, `ValueObservation` as `AsyncSequence` [V] | Your own actor around files. Simple but hand-built [U] |
| Migrations | `VersionedSchema` and `SchemaMigrationPlan`, macOS 14+ [V]. Real-world edge cases not checked | `DatabaseMigrator`, ordered, immutable, well documented [V] | Hand-rolled version field and decoder fallbacks [U] |
| Query speed 1k to 10k rows | Probably fine; `#Predicate` limits unchecked [U] | Fine with indexes or FTS5 [U, FTS5 enabled V] | In-memory scan, fine at this size [U]. Full rewrite per save |
| Testability (in-memory) | `isStoredInMemoryOnly` [V] | In-memory `DatabaseQueue` [V] | Temp dir or fake [U] |
| Crash safety | Core Data/SQLite underneath [U] | SQLite transactions and WAL [U, confirm on sqlite.org] | Atomic file replace only [U] |
| Licence | Apple, none | MIT [V] | n/a |
| Dependency weight | None | One SPM package, no transitive deps by default [V] | None |

## Recommendation (input to the later decision ticket, not a decision)

1. **GRDB for the history stores** (Clipboard now, Screenshot later). It has the best evidence on every criterion in the ticket: value types for the actor boundary, documented migrations, in-memory tests, and FTS5 if filtering ever needs it. It is MIT and has no transitive dependencies, so it fits the map rule of "small MIT/Apache packages only where they replace fiddly platform code, one ADR each". The rule requires one ADR for the dependency.
2. **Codable files for singleton documents** (Preferences, JSON Studio docs, Vault metadata if small), with atomic writes. Keep image bytes as files on disk, referenced by clip id or path from the database. [Reasoning, [U]]
3. **SwiftData is the weakest fit** for a background-actor plus `@MainActor @Observable` design on macOS 14. It adds a non-`Sendable` model layer and has documented merge and autosave problems in exactly our target OS range. It remains a viable zero-dependency fallback if the "no dependency" preference outweighs those risks.

## Uncertainties and suggested spikes

- No benchmarks were run. A small spike (10k synthetic clips, filter-as-you-type latency, `limit` pruning, concurrent write plus read) would settle query speed for GRDB and Codable and test `#Predicate` for SwiftData.
- The SQLite crash-safety claims need confirming on sqlite.org.
- GRDB's Swift 6.1 / Xcode 16.3 requirement needs checking against the project's toolchain, and whether pinning an older GRDB 6.x (not investigated) is acceptable.
- The FB13399899 claim and the thread 736226 content come from a search summary only.
- The Apple pages for the `#Predicate` limits and Core Data underpinnings were not read.
- The forum evidence is mostly iOS 17/18 and macOS 14.6/15.1. Behaviour on the exact 14.x patch OneShot ships against is not confirmed.
- Image storage budget, thumbnails and cleanup are a separate "not yet specified" item on the map, and this note does not settle them.
