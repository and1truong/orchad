# ADR-041: Organization portal presentation

Status: implemented bounded settings; exact-head CI pending. Reference-specific full branding/sharing remains OPEN.

Only the current tenant administrator may save a portal name, tagline and one of three fixed palettes. All roles can read their authenticated tenant's presentation. Human-only tools deliberately stay absent from agent catalogs; bridge/bearer credentials cannot become a settings channel. Live administrator authority is checked before original-key replay and inside the existing transaction. Tenant comes from the principal, never an argument.

Definitions/version, original key, audit and workspace revision commit together. Accounts, roles, learning, content, identity providers and certificate issuer labels are unchanged. Text is bounded and rendered literally with React; the palette maps to local fixed colors. No arbitrary HTML/CSS/logo URL, script or downloaded branding asset executes. Anonymous login remains generic Pear; session changes clear presentation before loading the new tenant and stale responses are discarded.

Migration 028 is additive. Domain/actual HTTP checks cover role/channel/tenant denial, exact replay/CAS, live role changes, validation, audit rollback and restart. A browser journey covers literal markup, reload, editor exclusion, outsider isolation and mobile EN/VI settings.

This is portal presentation, not cross-portal federation, asset/logo hosting, reference theme equivalence, identity branding or an accessibility compliance claim.
