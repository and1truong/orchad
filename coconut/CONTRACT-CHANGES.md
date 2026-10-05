# Contract changes

None. CONTRACT.md is byte-for-byte the provided snapshot (SHA-256 18ec8f8d1812ab06e77d39536b746d82482285073a79ee9a076149461d65962c).

Coconut policy is intentionally stricter: domain tools declaring read still require write scope and trusted approval. No descriptor alone grants invocation authority. Page-declared inputSchemas are validated against a host-safe keyword subset (no pattern/$ref/combinators/format, no schema-registry keys $id/$schema, no quadratic-cost uniqueItems; depth and size caps) before the sidecar compiles them with Ajv, so a hostile schema cannot wedge, stall, or crash the enforcement process; tools outside the subset fail UNSUPPORTED. This changes no field or method in the snapshot.
