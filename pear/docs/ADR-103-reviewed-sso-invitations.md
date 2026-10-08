# ADR 103 — Reviewed organization-identity invitations

Status: implemented original SSO invitation profile for #49 G13. Full reference
and actual external identity/mail delivery acceptance remain open.

## Public reference and decisions

Reviewed 2026-10-09:

- [Go1 Learn user administration](https://help.go1.com/en/articles/13211547-create-and-manage-users)
  describes admin user creation, notification preferences, individual/bulk
  welcome-email resend and preserved records after deactivation.
- [Go1 Learn welcome email](https://help.go1.com/en/articles/14835183-how-to-manually-send-a-welcome-email)
  describes admin-confirmed sending, one-time links and fresh links after expiry.

The documents disagree on some expiry details (24 hours / 7 days versus 72 hours).
Pear defaults to one day, accepts 1–30 explicit days and does not claim exact
reference/password/cross-portal equivalence. This is an explicit original policy,
not an approved exception to full parity.

## Identity and authority

Provision the account through the existing reviewed People/CSV/SCIM flow first.
A live tenant admin reviews its immutable account ID, exact subject for the
server-configured issuer/client, recipient email, expiry and reason. An invitation
never creates or copies learning, sets a password, changes roles, trusts email
claims or grants access from its URL. The random invitation ID is a locator,
not a bearer credential. Share links only with intended recipients anyway.

Pending invitations pin both account and creating administrator auth versions.
Inactive/downgraded/reassigned/revoked accounts/admins, changed issuer/client,
expired/revoked invitations and independently changed identity mappings fail
closed before OIDC start and again after verified code exchange. Global
issuer/subject and issuer/account uniqueness reject duplicate pending invites;
an admin must explicitly revoke/reissue. Expired pending rows release that
reservation, preserving history. Different accounts/tenants cannot be silently
merged or reassigned.

The existing nonce, S256 PKCE, browser cookie, exact provider hash, JWT signature,
issuer/audience/time and callback replay checks apply. Callback acceptance requires
the exact reviewed subject, atomically creates its mapping, revokes prior target
sessions, advances auth/workspace revisions, records acceptance and creates the
new session. Any failure, including final login audit failure, rolls back all
mapping/session/acceptance effects. Existing accounts/roles/profiles/enrollments,
completion/proofs/certificates are preserved. Later ordinary SSO sign-in uses the
accepted mapping; reusing an invitation fails. Removing accepted access uses the
existing explicit identity unlink/deactivation workflow, not invitation revoke.

Creation/revocation have library CAS, immutable idempotency receipts and audit
transactions. HTTP mutation routes require live session, origin/host, CSRF and
epoch. Invitations, recipient addresses, links and mail credentials are absent
from model bridge tools/context. Audits omit recipient email and mail credentials.
Human EN/VI forms and links are literal React text with bounded backend validation.

## Optional mail transport

`PEAR_INVITATION_MAIL` is server-only JSON `{ "url": "https://...", "token": "..." }`.
Keep its token in trusted deployment secret configuration, never in chat/frontend.
It names a reviewed mail relay; Pear does not guess SMTP/provider contracts.
Outside the loopback identity fixture, configuration requires HTTPS and secure
session cookies. No endpoint means no sending; the UI explicitly says so.

A human explicitly confirms the addressed email before `/api/invitations/:id/send`.
The relay receives a bounded JSON POST with `recipient`, `url`, `expiresAt`,
`Authorization: Bearer ...` and stable `Idempotency-Key: <invitation ID>`.
It must honor that key across retries and accept this reviewed payload; automatic
redirects are rejected and requests time out after five seconds. The invitation
is checked live before dispatch. Delivery reservation/audit persist before I/O;
an in-flight reservation blocks concurrent attempts for 60 seconds and then can
recover after process death. Failure is retryable; acknowledged transport is not
resent under another operation key. Revocation after dispatch cannot retract an
email, but always prevents redemption. `acceptedByTransport` means HTTP acceptance,
not mailbox delivery. Ambiguous failures can retry: exactly-once external delivery
depends on relay deduplication, not a local promise.

No email is automatically sent on create/CSV/SCIM. Individual and page-bounded bulk explicit delivery
(up to 20 individually reauthorized invitations), manual links, revoke/expiry/reissue
and exact-identity acceptance are implemented. Bulk results preserve each failure
and accepted count; they never report recipient delivery. Bulk sending across
all filtered pages, bearer/password onboarding, automatic welcome notifications,
cross-portal account reconciliation and live IdP/relay/recipient delivery remain
open. Production storage/scanning/retention/isolation gates remain independent.

## Evidence

- `invitations.test.ts`: admin/RBAC/tenant, input bounds/CAS/receipt/duplicate,
  expiry/reissue, audit rollback, SQLite reopen, authority changes/mappings,
  immutable learning, signed OIDC wrong-subject/revocation/audit/one-time acceptance,
  actual HTTP CSRF/epoch, loopback mail failure/retry/dedup and no secret egress.
- `e2e/invitations.spec.ts`: built Chromium, mobile-width real human review,
  explicit mail confirmation, actual loopback receiver, wrong/exact subject,
  one-time acceptance, revoked link and bridge absence. This fixture proves
  transport/authority, not external mailbox delivery or Go1 behavior.
- Existing `identity.test.ts`, `identity.spec.ts` and People regressions retain
  ordinary sign-in/provisioning and current role behavior.
