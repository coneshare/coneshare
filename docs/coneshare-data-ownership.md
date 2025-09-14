# Data Ownership Model Analysis for Coneshare

This document analyzes data ownership models for Coneshare, an enterprise-focused product. This is a critical architectural decision that deeply impacts the entire application. Let's analyze a **"Personal Ownership Model"** versus the recommended **"Organization Ownership Model"**.

### Summary of Your Proposed Model (Personal Ownership)

1.  **Primary Owner:** `User` owns `Document`. The `organizationId` on a `Document` would either not exist or would be nullable.
2.  **Sharing:** A `User` can "share" their personal document with an `Organization`.
3.  **Organization's Role:** An `Organization` acts as a collaboration space where documents from multiple users are aggregated.

Here is an analysis of this proposal, highlighting the significant issues you would face, especially for an enterprise-focused product like Coneshare.

---

### Analysis: Potential Problems and Risks

#### 1. Data Ownership & Employee Offboarding (Critical Flaw)

This is the most significant problem. In an enterprise context, company documents are assets of the **company**, not the employee.

*   **What Happens When an Employee Leaves?** In your model, if a user who owns critical documents is removed from the system, what happens to those documents?
    *   Do they get deleted? This would be catastrophic for the company.
    *   Do they remain, but are now "orphaned"? Who manages them?
    *   Do you have to build a complex "transfer ownership" workflow every time someone leaves?
*   **The "Organization Ownership" Solution:** The model described in `coneshare-data-model.md` solves this cleanly. The `Organization` owns the `Document`. If an employee leaves, their user account is deactivated, but all the documents they created for the company remain exactly where they are, owned by and accessible to the organization. **This is standard and expected behavior for B2B applications.**

#### 2. Permissions and Access Control Complexity

The personal ownership model creates a much more complex permissions system. A document's access is no longer defined by a single, hierarchical context (`Organization` -> `Dataroom` -> `Folder`).

*   **Data Rooms:** How does this work with data rooms? If a user shares their personal document into an organization's data room, who controls the fine-grained permissions for that document within the data room? The document owner or the data room admin? This ambiguity is a source of security risks and bugs.
*   **The "Organization Ownership" Solution:** Access is straightforward. If you are a member of the organization and have permissions on the data room, you can access the document. The ownership is unambiguous.

#### 3. Resource Management & Quotas

If you plan to implement storage limits per organization (a common enterprise feature), the personal ownership model complicates accounting.

*   **Whose Quota is Used?** If User A (with a 1GB limit) shares a 100MB file with an `Organization` (with a 10GB limit), whose storage quota does that 100MB count against? The user's? The organization's? Both?
*   **The "Organization Ownership" Solution:** All documents belonging to an organization count against that organization's storage quota. It's simple, predictable, and easy to manage.

#### 4. UI/UX Confusion

The user interface would need to manage multiple contexts, which can be confusing for the user.

*   They would have a "My Documents" area (personal) and then separate views for each team they are a part of.
*   Moving documents between these contexts becomes a "share" action rather than a simple "move" action, which might not be intuitive.

---

### Recommendation: Stick with the Organization-centric Model

I strongly recommend against the personal ownership model for an enterprise product. The **Organization-centric ownership model** (where the `Organization` is the ultimate owner of all resources like `Documents`, `Datarooms`, etc.) is the industry standard for B2B SaaS for very good reasons:

*   **Aligns with Business Reality:** The company (Organization) owns the data.
*   **Simplifies Offboarding:** No data loss or complex migration is needed when an employee leaves.
*   **Clear Permissions:** A single, hierarchical source of truth for access control.
*   **Easy Resource Management:** Quotas and limits are simple to calculate and enforce at the organization level.

### A Hybrid Solution to Get the "Best of Both Worlds"

If the goal is to give users a private space to work on drafts before sharing with the wider organization, this can still be achieved *within* the organization-centric model by using fine-grained permissions (e.g., a document is owned by the organization but is only visible to its creator until explicitly shared with a wider user group). This approach provides the desired private workspace for users while ensuring that all collaborative, business-critical documents have clear, unambiguous company ownership from the moment of creation, solving the critical offboarding problem.
