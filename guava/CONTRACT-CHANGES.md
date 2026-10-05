# Contract compatibility

No change to Agent App Bridge 0.1 methods, required fields, enums or result envelope is proposed.

The authoritative file fetched from main is `and1truong/orchad/contract`, commit b51ce3049dd9619c622032de1d1932017a15098e, blob 024abfa69475ebd25e8017f16133c7049d2845ae. `guava/CONTRACT.md` copies its exact UTF-8 contents, including no trailing newline.

The prompt declares snapshot SHA-256 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c. The actual main file SHA-256 is 137db8eb8557bdad656a48337c9020227fc7a1ca1d3b537469ca5cfbd90d564d. This byte-level difference is documented, not silently asserted identical. Implementation follows the supplied/main contract semantics.

Application-specific choices do not add required bridge fields:

- appId is orchard-guava; stable seeded document IDs are rca-consumer-lag and brainstorm-workshop.
- Domain read inputs use bounded paging; mutation results expose mutationId to permit explicit undo.
- Patches also support update_edge and auto_layout; all tool argument schemas are described in the app registry.
- human_accept_conclusion is a separate human HTTP operation, never a bridge tool.
- Read calls require null revision and key. Writes store canonical semantic toolName/arguments/expectedRevision; requestId is excluded.
- Native draft WebMCP adapter has a transport-specific envelope schema and still routes through host policy to the same bridge. It does not change Page Bridge 0.1 and is not auto-enabled.

## Update: `sessionEpoch` adopted into the shared contract

Root `contract` was updated at commit `c4de57a` (SHA-256 `1ae668a66fcaac00183e54cbbd1bb67877ff55045e94ebb6eb982c0d1a4d1333`, git blob `480d6a53b27a7f4c9d15c49f694804a296ebb5ea`); `guava/CONTRACT.md` is byte-for-byte identical to it again. Two optional additions were adopted, adding no required fields:

- `getContext` may return an optional `sessionEpoch`: an opaque string the app's backend issues per login session. Guava returns the `/api/session` `sessionInstanceId` (already an opaque hash of the session record, never a credential). Hosts pin it into consent/pairing/bind and fail closed when it changes or disappears; backend authorization is unchanged and still enforced per call.
- A `ToolDescriptor.inputSchema` must sit inside the bounded host-declared JSON Schema dialect the host publishes. Guava's catalog (pattern/uniqueItems/oneOf/min-max bounds) is inside coconut's and lime's published dialects; the backend still validates every argument server-side regardless of host checks.
