# Contract changes

None. CONTRACT.md is a byte-identical copy of the repository root contract.

Pear adds a domain-specific tool catalog in src/shared/catalog.ts; it does not change the host/page/gateway contract. Three assessment/acknowledgement operations exist only in the human HTTP controller and are not tools exposed to agents. Domain schemas and role/effect mapping are frozen for the 0.1 synthetic vertical slice in ADR-001-LEARNING-BOUNDARIES.md. Read envelopes use null expectedRevision/idempotencyKey per the canonical prose contract; Pear models that nullable envelope locally because the shared helper's exported Call type is mutation-only.
