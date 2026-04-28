# Coneshare Dataroom Ownership and Department Scope

## Strategy refs
- [Coneshare Roadmap](./coneshare-roadmap.md)
- [Coneshare Technology Stack](./coneshare-techstack.md)
- [Coneshare Data Model](../coneshare-data-model.md)
- [Data Ownership Model Analysis for Coneshare](../coneshare-data-ownership.md)

## Out of scope
- Detailed API/serializer/view implementation for dataroom CRUD and sharing.
- Frontend screen-level behavior for dataroom management and public viewer flows.
- Database migration scripts for future department rollout.
- Department-specific RBAC policy matrix.

## Design decisions
- Decision: Keep `Organization` as the primary owner for `Dataroom`, `Document`, and related core resources.
  Rationale: Preserves unambiguous tenant ownership and aligns with enterprise offboarding requirements.
  Tradeoff: Department boundaries are not ownership boundaries and must be modeled in permissions.
- Decision: Treat departments as optional scoping/filtering metadata, not as top-level resource owners.
  Rationale: Allows additive rollout without changing ownership semantics.
  Tradeoff: Requires explicit logic for department-aware visibility and assignment.
- Decision: Roll out department support as additive nullable links and membership models.
  Rationale: Minimizes migration risk and keeps existing dataroom/document records valid.
  Tradeoff: Null-aware logic must be handled consistently in queries and UI filters.

This document defines the architecture decision for dataroom ownership and the future department model in Coneshare.

---

## V1 Baseline

In V1, Coneshare runs a clean organization-centric model:

- `Organization` is the top-level tenant and owner boundary.
- `Dataroom` belongs to `Organization`.
- `Document` belongs to `Organization`.
- Permissions determine who can access resources; ownership does not move between users/departments.

This keeps access-control logic and data lifecycle behavior consistent with enterprise expectations.

---

## V2 Direction: Department as Optional Scope

Department support is a future additive layer:

1. Introduce department entities (for example, `Department`, `DepartmentMembership`) scoped to one `Organization`.
2. Add optional (`nullable`) department links on scoping-sensitive resources such as `Dataroom` and `Document`.
3. Use department assignment for filtering, visibility defaults, and workflow routing.
4. Keep ownership unchanged: resources are still organization-owned.

---

## Why This Split Works

1. Preserves clear enterprise ownership and offboarding behavior.
2. Avoids breaking migrations for existing V1 records.
3. Supports gradual adoption: orgs can ignore departments until needed.
4. Allows department-aware features without destabilizing core tenancy semantics.

---

## Policy

In Coneshare, departments are permission and scoping constructs, not ownership constructs. Core resources remain organization-owned across versions.
