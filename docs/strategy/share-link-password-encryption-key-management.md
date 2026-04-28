# Coneshare ShareLink Password Encryption and Key Management

## Strategy refs
- [Coneshare Roadmap](./coneshare-roadmap.md)
- [Coneshare Technology Stack](./coneshare-techstack.md)
- [Coneshare Data Model](../coneshare-data-model.md)

## Out of scope
- End-user password UX flows in frontend forms.
- Third-party KMS/HSM integration implementation details.
- Full incident response runbook for key-compromise events.
- Encryption policy for non-ShareLink secrets (covered in other docs).

## Design decisions
- Decision: Store ShareLink passwords encrypted at rest (not one-way hashed).
  Rationale: Supports owner-side password retrieval/edit workflows while maintaining data protection.
  Tradeoff: Requires strict encryption key management discipline.
- Decision: Keep encryption keys externalized via environment configuration.
  Rationale: Enables key rotation without code changes and avoids hardcoded secrets.
  Tradeoff: Operational complexity increases across environments.
- Decision: Support staged key rotation with multiple active decrypt keys.
  Rationale: Allows non-disruptive re-encryption and gradual key transitions.
  Tradeoff: Requires careful sequencing and verification to avoid data-access regressions.

This document defines strategy-level policy for ShareLink password encryption and key lifecycle management.

---

## Encryption Policy

1. ShareLink passwords must be encrypted at rest in the database.
2. Plaintext password values must never be logged.
3. API responses must expose password values only where explicitly required by authorized owner workflows.
4. Secret-bearing fields must be masked/redacted in logs and error traces.

---

## Key Management Policy

1. Keys must be provided via environment variables (for example `FIELD_ENCRYPTION_KEY` / `FERNET_KEYS`).
2. Production keys must not be stored in repository files.
3. Key material should be unique per environment.
4. Access to key material must be restricted to operational principals that require it.

---

## Rotation Strategy

Recommended staged rotation:

1. Generate a new key.
2. Configure key list with new key first, old key retained for decryption fallback.
3. Deploy and verify decrypt/read paths.
4. Re-encrypt existing ShareLink password records.
5. Remove retired key after verification.

---

## Verification Requirements

After key configuration or rotation:

1. Verify existing ShareLink password reads/decrypt paths.
2. Verify new writes use the newest key.
3. Verify password validation endpoints continue to function.
4. Run regression tests for share-link creation/update/verify flows.
