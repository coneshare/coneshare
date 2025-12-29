# Coneshare Feature Roadmap

This document outlines the strategic roadmap for Coneshare, organized by implemented features and future goals.

---
## Guiding Principles

All development aligns with these core principles:

1.  **Security First**: Prioritize robust security features like access control and data isolation.
2.  **Reliability & Scalability**: Ensure the system handles large files and high concurrency.
3.  **Administrator Control**: Provide administrators with full control over configuration and user management.
4.  **Zero Third-Party Trust**: The solution must run entirely on the client's infrastructure.
5.  **Unified "Open Core" Model**: Build a single, shared database schema for both open-source and future SaaS versions.

---
# Implemented Features

## Version 1.0: Secure Document Sharing Engine

The core lifecycle of a single document is complete.

### 1. Core Platform & User Management
-   **Organization as Tenant**: The `Organization` is the top-level owner of all resources.
-   **User Authentication**: Robust authentication system where users belong to an `Organization`.
-   **User & Group Management**: Admins can manage users, roles (admin, member), and `User Groups`.

### 2. Document Pipeline & Storage
-   **Storage Configuration**: Flexible backend supporting **MinIO** or a **local filesystem**.
-   **Asynchronous Document Processing**: Background queue manages conversions for PDF, DOCX, PPTX, XLSX.
-   **Status Tracking**: UI displays document status: `Uploading`, `Processing`, `Ready`, `Error`.

### 3. Secure Link Sharing
-   **Link Generation**: Backend service generates unique, secure links for documents.
-   **Access Control Features (per link)**: Link Expiration, Password Protection, Email Verification, and Download Control.
-   **Document Viewer**: A clean, performant, in-browser PDF viewer.

### 4. Foundational Analytics
-   **View Tracking**: Logs every link view with details like viewer identity, duration, and completion rate.
-   **Core Analytics Dashboard**: UI lists viewers for a link, shows total views, and distinguishes between identified and anonymous viewers.

### 5. Self-Hosting & Administration
-   **Docker Compose Setup**: Simple one-command deployment.
-   **Comprehensive Documentation**: Clear instructions for setup and configuration.
-   **Admin Panel**: Administrative interface to manage users and system configurations.

## Version 2.0: Collaborative Data Room

The foundational features for data rooms are in place.

### 1. Data Room Structure & Management
-   **Data Room Model**: Data models for `Dataroom`, `DataroomFolder`, and `DataroomDocument` are implemented.
-   **UI for Data Rooms**: UI for creating, renaming, deleting, and managing content in data rooms exists.

### 2. Granular Permissions
-   **User Groups**: Admins can create groups of users within the organization.
-   **Link-Level Permissions**: When sharing a data room, the creator can select which files and folders are visible for that specific link.

### 3. Advanced Features & Analytics
-   **Watermarking**: Dynamic server-side watermarking on documents is implemented, with support for displaying viewer's email and IP address.

---
# To Do (Future Roadmap)

## Version 1.0 Enhancements

### 1. Document Pipeline & Storage
-   **Drag-and-Drop Uploads**: Add a drop zone to the UI for uploading files and folders directly from the user's desktop.
-   **Resumable File Uploads**: Implement a robust file upload handler that supports chunking (e.g., via the Tus protocol) to reliably handle large enterprise files.

## Version 2.0: Advanced Data Room Features

### 1. Data Room Structure & Management
-   **UI for Data Rooms**: Build a hierarchical file explorer UI to move documents/folders within a data room using drag-and-drop.

### 2. Granular Permissions
-   **Group-Based Permissions**: Implement backend logic and UI for admins to assign `view` and `download` permissions to specific `User Groups` on a per-folder or per-document basis within a data room.

### 3. Advanced Features & Analytics
-   **Data Room Analytics**: Provide an aggregated analytics view for an entire data room, with a collapsible tree view to show stats for individual files and folders.
-   **Branding**: Allow custom branding (logo, colors) on a per-data-room basis.
-   **Data Room Analytics**: Provide an aggregated analytics view for an entire data room, with a collapsible tree view to show stats for individual files and folders.
-   **Branding**: Allow custom branding (logo, colors) on a per-data-room basis.

### 4. Enterprise Readiness
-   **Audit Logs**: Implement the data model and UI to log and view significant events (logins, uploads, permission changes).
-   **SSO Integration**: Add support for SAML-based SSO providers like Okta and Azure AD.
-   **Advanced Configuration**: Allow admins to enforce security settings organization-wide (e.g., disable public links, require passwords on all new links).
