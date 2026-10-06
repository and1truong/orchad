# ADR-022: Reviewed scoped SCIM provisioning profile

Status: internal profile implemented; exact-head CI required. Actual provider sandbox and deployment NOT VERIFIED.

## Profile and boundaries

The frozen subset is based on RFC 7643 (https://www.rfc-editor.org/rfc/rfc7643.html) and RFC 7644 (https://www.rfc-editor.org/rfc/rfc7644.html). This is not a general SCIM/provider conformance claim. Explicit secure startup enables `PEAR_SCIM_ENABLED=true`; HTTPS/secure cookies are required. Programmatic loopback identityFixture permits fixtures only and is never read from startup environment.

A live tenant administrator issues an expiring 1–30 day client credential through human same-origin/CSRF/epoch/library CAS. The raw 256-bit secret is shown once and is never persisted in browser storage, audit, idempotency or SQLite; only its hash is stored. Exact retry returns metadata with no secret. Read/write scopes are distinct, credentials are tied to the issuer's auth version and require that issuer to remain an active administrator. Revocation/expiry/owner-role changes apply before reads and exact mutation retry. Settings and tokens are absent from Bridge tools.

Machine routes are `/scim/v2`, authenticated exclusively by scoped Bearer credentials, with exact Host and no cookie fallback. JSON bodies remain 64 KiB; lists use at most 20 complete resources/48 KiB and actual itemsPerPage. No generic proxy, provider token forwarding, outbound request, automatic identity adoption or role authority is added.

## Resources

Each credential owns distinct managed opaque User/Group IDs. Existing accounts are never adopted by userName/externalId, and SCIM externalId never becomes an OIDC mapping. Accounts are created only as learners with randomly discarded synthetic-password secrets. User attributes are userName, displayName, active, preferredLanguage (en/vi), externalId and core schemas. Names are bounded; userName uniqueness is tenant-wide, NFKC/case-insensitive. Roles, password, enterprise attributes, entitlements and manager writes are rejected.

Static groups accept up to 100 distinct same-client managed User references. No arbitrary references, dynamic rule writes or external fetch occurs. PATCH supports 1–10 add/replace/remove operations with explicit documented paths; filtered paths/pathless object patches are unsupported. Remove supports externalId and whole members. Adding members appends bounded references; replacing members replaces the entire membership.

GET/list/POST/PUT/PATCH/DELETE and authenticated metadata endpoints are provided. Lists support a single `eq` filter: Users userName/externalId/id; Groups displayName/externalId/id. Complex filters, sorting, bulk, passwords and extensions are explicitly unsupported. Provider configuration describes this subset; provider-specific filter/PATCH/ETag behavior remains a compatibility gap.

Every existing-resource mutation requires current If-Match. ETags include the current managed version and relevant live human-account/group representation, preventing overwrite after human edits. Human promotion to a privileged role or conversion to a dynamic group blocks SCIM mutation, including replay.

Optional Idempotency-Key scopes exact reconciliation to this client and method/path/body, excluding ETag so an exact response can be recovered after a stale version. Client/resource ownership and live privilege are checked before replay. User/group creation quota: 1000 rows each/client including tombstones. Durable reconciliation ledger: 10000 entries/client; requests fail rather than silently discard history. Credential quota: 128/tenant. GET reads current state after a recovered historical write response.

## Transactions and retention

PeopleService validates the same tenant/profile/manager graph and updates personal revision and session revocation. SCIM writes, managed rows, library revision, privacy-minimal audit and reconciliation ledger share an IMMEDIATE transaction. Audit failure rolls everything back.

active=false revokes sessions through existing authority logic. DELETE is a tombstone and deactivation, retaining accounts, learning workspaces, enrollment pins, assignments, attempts, certificates and OIDC history. Deleted groups retain the internal group but clear members; future group plans see no members. Tombstone userName uniqueness is released for a new distinct account; it never resurrects or remaps the old identity. Group membership references to deleted users are omitted on live reads.

## Evidence and remaining work

Eight domain/HTTP fixtures cover real HTTP media type/parser, metadata, live roles/scopes/expiry/revocation, no-cookie authentication, one-time secret storage, graph/pins/history, same-client ownership, ETag/live human edits, atomic patch/audit rollback, whole pagination and restart/reconciliation. A real browser and HTTP SCIM client review a credential, create/reconcile/deactivate a managed user, hide/reload the one-time secret and revoke the credential.

Actual IdP/HRIS provider sandbox, enterprise schema profile, provider-specific operations, invitations, provider-wide logout and production provisioning/HTTPS configuration remain BLOCKED/NOT VERIFIED. No external account, provider credential, deployment or network delivery was configured.
