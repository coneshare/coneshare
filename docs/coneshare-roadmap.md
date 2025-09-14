Here is a strategic roadmap for **Coneshare**, an enterprise-grade, self-hosted document sharing solution. This plan focuses on building a solid,
secure foundation in Version 1.0, before expanding to advanced data room features in Version 2.0.

This roadmap is designed for a completely self-hosted environment, with no reliance on third-party cloud services. For a detailed technology breakdown, see the `coneshare-techstack.md` document.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Guiding Principles for Coneshare

Before diving into features, all development should align with these core principles for a true self-hosted solution:

 1 **Security First:** Enterprise clients demand robust security. Features like access control, audit logs, and data isolation are paramount.
 2 **Reliability & Scalability:** The system must handle large files and high concurrency. The document processing pipeline is a critical component.
 3 **Administrator Control:** The enterprise administrator needs full control over configuration, user management, and system monitoring.
 4 **Zero Third-Party Trust:** The entire solution must run on the client's infrastructure, from storage to email, without calling out to external cloud services.
 5 **Unified "Open Core" Model:** Build a single, shared database schema that serves both the open-source, self-hosted version and a future closed-source SaaS version. SaaS-specific features will be managed via separate code modules and feature flags.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Version 1.0: The Secure Document Sharing Engine

The goal of V1.0 is to perfect the core lifecycle of a single document: upload, process, secure, share, and track. This builds the foundational components
required for V2.0.

1. Core Platform & User Management

 • **Organization as Tenant:** The `Organization` will be the top-level tenant and the direct owner of all resources (documents, datarooms, etc.). This model supports both single-company (self-hosted) and multi-company (future SaaS) deployments.
 • **User Authentication:** A robust authentication system where a user belongs to an `Organization`.
 • **User & Group Management:**
    • Organization admins can invite and remove users.
    • Implement roles at the Organization level (e.g., 'admin', 'member').
    • Admins can create `User Groups` (e.g., "Legal", "Sales") for assigning granular permissions to resources.

2. Document Pipeline & Storage

 • **Resumable File Uploads:** Implement a robust file upload handler that supports chunking (e.g., via the Tus protocol) to reliably handle large enterprise files.
 • **Storage Configuration:**
    • Build a flexible storage backend that is configurable via environment variables to support on-premise solutions like **MinIO** or a **local filesystem**. No cloud-based storage should be included.
 • **Asynchronous Document Processing:**
    - A background queue will manage document conversions.
    • **Initial Converters:** Focus on the most common enterprise formats: PDF (no conversion needed), DOCX, PPTX, XLSX, likely using tools like LibreOffice in a containerized worker.
    • **Status Tracking:** The UI must communicate with the API to clearly show the document's status: `Uploading`, `Processing`, `Ready`, `Error`.

3. Secure Link Sharing

 • **Link Generation:** A backend service to generate unique, secure links for documents.
 • **Access Control Features (per link):**
    • Set Link Expiration Date.
    • Password Protection.
    • Email Verification (require viewers to enter their email).
    • Allow/Disallow Downloading.
 • **Document Viewer:** A clean, performant, in-browser PDF viewer.

4. Foundational Analytics

 • **View Tracking:** The backend will log every view associated with a link, capturing details like viewer identity (if available), duration, and completion rate.
 • **Core Analytics Dashboard:**
    • A UI to list all viewers for a specific link.
    • Show total views, last viewed date, and total time spent.
    • Distinguish between identified viewers (via email capture) and anonymous viewers.

5. Self-Hosting & Administration

 • **Docker Compose Setup:** Provide a `docker-compose.yml` file for a simple, one-command deployment of the entire stack.
 • **Comprehensive Documentation:** Write clear, step-by-step instructions for initial setup, configuration of storage (MinIO/filesystem), and a customer-provided **SMTP server** for sending emails.
 • **Admin Panel:** Provide a powerful, ready-to-use administrative interface to manage users, teams, and system configurations.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Version 2.0: The Collaborative Data Room

With the core document engine built, V2.0 introduces the concept of structured collections, collaboration, and granular permissions.

1. Data Room Structure & Management

 • **Data Room Model:** Extend the data models to include `Dataroom` and its relationships with `Folders` and `Documents`.
 • **UI for Data Rooms:**
    • Create, rename, and delete data rooms.
    • Build a hierarchical file explorer UI to create folders, and move documents/folders within a data room using drag-and-drop.
    • Enable adding existing documents from the library into a data room.

2. Granular Permissions

 • **User Groups:** Allow admins to create groups of users within the organization (e.g., "Legal", "Investors", "Sales Team").
 • **Group-Based Permissions:**
    • The backend will handle permission logic.
    • The UI will allow admins to assign `view` and `download` permissions to specific groups on a per-folder or per-document basis within a data room.
 • **Link-Level Permissions:**
    • When sharing a data room via a link, allow the creator to select exactly which files and folders are visible through that specific link.

3. Advanced Features & Analytics

 • **Data Room Analytics:**
    • Provide an aggregated analytics view for the entire data room.
    • Build a collapsible tree view to show analytics for individual files and folders within the data room (who viewed what, for how long).
 • **Branding:** Allow custom branding (logo, colors) on a per-data-room basis.
 • **Watermarking:** Implement dynamic server-side watermarking on documents, displaying the viewer's email and the time of access.

4. Enterprise Readiness

 • **Audit Logs:**
    • Create a data model to log significant events: user logins, file uploads/deletes, data room creation, permission changes.
    • Provide an interface for admins to view and search these audit logs.
 • **SSO Integration:** Add support for SAML-based SSO providers like Okta and Azure AD.
 • **Advanced Configuration:** Allow admins to enforce security settings organization-wide (e.g., disable public links, require passwords on all new links).

