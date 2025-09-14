# Coneshare: Dataroom vs. Department Model

This document outlines the architectural direction for data modeling in Coneshare. It recommends a phased approach, starting with a simple Team-centric model in V1, and adding a `Department` model as a non-breaking change in a future version. This strategy avoids upfront complexity while providing a clear path for enterprise features.

---

### Recommended Architecture: Dataroom First, Department Later

We will design the V1 model to be robust on its own, with a clear and simple ownership structure. The future `Department` model will be layered on top for filtering and access control, without changing the core ownership of resources.

#### Version 1.0: Team-Centric Model (Simple & Clean)

For the first version, we will stick to the straightforward and powerful model outlined in `coneshare-data-model.md`.

*   **Primary Owner**: The `Team` is the top-level tenant and the direct, unambiguous owner of all core resources.
*   **`Dataroom` Ownership**: A `Dataroom` belongs directly to a `Team`.
*   **`Document` Ownership**: A `Document` belongs directly to a `Team`.
*   **Simplicity**: There is no concept of a `Department`. This keeps your permission logic, API endpoints, and UI clean and focused. All users within a team can potentially see all datarooms, subject to future permissions.

The V1 Schema is as follows.

```prisma
// file: coneshare/prisma/schema/dataroom.prisma
model Dataroom {
  id              String   @id @default(cuid())
  name            String
  // Direct ownership by Team. Clean and simple for V1.
  teamId          String
  team            Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  // ... other fields
}

// file: coneshare/prisma/schema/document.prisma
model Document {
  id              String   @id @default(cuid())
  name            String
  // Direct ownership by Team.
  teamId          String
  team            Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  // ... other fields
}
```

---

#### Version 2.0: Evolving to Add Departments (Non-Breaking Change)

When you are ready to add the `Department` feature for enterprise clients, you can do so without migrating or breaking your existing data structure.

**The Strategy:** Introduce `Department` as a **scoping and filtering mechanism**, not as the primary owner of resources.

1.  **Add New Models**: Introduce the `Department` and `DepartmentMembership` models. A `Department` will belong to a `Team`.

    ```prisma
    // file: coneshare/prisma/schema/department.prisma (NEW in V2)
    model Department {
      id              String   @id @default(cuid())
      name            String
      teamId          String
      team            Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
      members         DepartmentMembership[]
      // Note: No direct ownership of Document/Dataroom here
    }

    model DepartmentMembership {
      // ... (as defined previously)
    }
    ```

2.  **Add a Nullable Relation**: Add an *optional* `departmentId` to `Dataroom` and `Document`.

    ```prisma
    // file: coneshare/prisma/schema/dataroom.prisma (MODIFIED in V2)
    model Dataroom {
      id              String   @id @default(cuid())
      name            String
      teamId          String   // Unchanged. Still the primary owner.
      team            Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
      
      // ADDITIVE CHANGE FOR V2:
      departmentId    String?  // Optional link for scoping
      department      Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
    }

    // file: coneshare/prisma/schema/document.prisma (MODIFIED in V2)
    model Document {
      id              String   @id @default(cuid())
      name            String
      teamId          String   // Unchanged. Still the primary owner.
      team            Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
      
      // ADDITIVE CHANGE FOR V2:
      departmentId    String?  // Optional link for scoping
      department      Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull)
    }
    ```

---

### Advantages of This Phased Approach

1.  **V1 is Simple**: The initial codebase is not complicated by a `Department` model that isn't needed yet. The logic is clean: everything belongs to the `Team`.
2.  **No Breaking Changes**: To implement V2, you only add new models and add new *optional* fields. All of your existing V1 data remains valid (`departmentId` will just be `NULL`). There is no complex data migration.
3.  **Preserves Correct Ownership**: The `Team` remains the ultimate owner. This solves the critical enterprise problem of employee offboarding (as detailed in `coneshare-data-ownership.md`). The `departmentId` is used for UI filtering and permissions, not for ownership.
4.  **Opt-In Complexity**: For small business users, the `departmentId` will always be `NULL`, and the UI won't show any department features. For enterprise users who enable the feature, the application logic can then use the `departmentId` to scope what users can see and create.

This architecture allows for a simple, robust V1 and provides a clear, non-disruptive path to add enterprise-level department features in the future.
