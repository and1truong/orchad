# Contract changes

No semantic changes proposed. CONTRACT.md copies the `contract` file on repository main, Git blob 024abfa69475ebd25e8017f16133c7049d2845ae. The prompt supplies snapshot SHA-256 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c. The actual file retrieved from main has SHA-256 137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d (without an added trailing newline). This discrepancy is recorded rather than claiming a checksum match. The committed main snapshot is authoritative for this implementation.

The gateway subset schema requires explicit `content` on messages, allowing null on assistant function calls, matching the portable client output. Limits and error response codes are gateway policy, not additions to Page Bridge or agent event enums. Authentication and transport errors have separate client event codes; completed event finish reasons are unchanged.

Message and argument size limits are interpreted per Unicode character (JSON Schema `maxLength` semantics), not per UTF-8 byte: a 65,536-character field may occupy more bytes. The byte-oriented bounds (512,000-byte body, 262,144-byte normalized output, 2,000,000-byte SSE decode) apply independently, and quota reservations are computed on UTF-8 bytes. This reading is recorded so every repository interprets the contract's size-limit requirement the same way.
Untrusted tool schemas are validated with a per-request Ajv registry, never a process-global one: two requests presenting the same schema `$id` compile independently, and a rejected schema cannot poison later requests. Admission checks (rate, then concurrency) run before schema compilation; each `parameters` value is bounded to 64 KiB of JSON and 512 schema nodes. This records gateway validation policy; it adds no contract fields or enums.


## Update: contract resync

Root `contract` was updated at commit `c4de57a` (SHA-256 `1ae668a66fcaac00183e54cbbd1bb67877ff55045e94ebb6eb982c0d1a4d1333`, git blob `480d6a53b27a7f4c9d15c49f694804a296ebb5ea`); `mango/CONTRACT.md` is byte-for-byte identical to it again. The adopted additions (optional `sessionEpoch` in `getContext`, the host-declared schema-dialect requirement) add no required fields and do not affect the gateway or agent-client surface; this note only records the resync.
