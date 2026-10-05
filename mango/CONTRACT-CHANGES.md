# Contract changes

No semantic changes proposed. CONTRACT.md copies the `contract` file on repository main, Git blob 024abfa69475ebd25e8017f16133c7049d2845ae. The prompt supplies snapshot SHA-256 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c. The actual file retrieved from main has SHA-256 137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d (without an added trailing newline). This discrepancy is recorded rather than claiming a checksum match. The committed main snapshot is authoritative for this implementation.

The gateway subset schema requires explicit `content` on messages, allowing null on assistant function calls, matching the portable client output. Limits and error response codes are gateway policy, not additions to Page Bridge or agent event enums. Authentication and transport errors have separate client event codes; completed event finish reasons are unchanged.
