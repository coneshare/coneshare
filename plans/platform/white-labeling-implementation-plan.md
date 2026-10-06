# Coneshare: White-Labeling & Global Branding Implementation Plan

## Overview
This plan outlines the implementation of a white-labeling feature for Coneshare. It allows administrators to customize the instance's logo, brand name, and website link via a dedicated admin interface, overriding the default "Coneshare" branding on public-facing pages (e.g., login, signup).

To respect the open-source nature of the project, a mandatory "Built on Coneshare" footer/link will be integrated into all public-facing pages.

## Architecture & Data Model Strategy
Currently, Coneshare operates with a single default `Organization`. We will attach the branding fields to the `Organization` model. Even in a single-tenant model, this future-proofs the database schema and matches how the backend currently scopes users and events via `request.user.organization`.

### Part 1: Data Model Updates (backend/core/models.py)
Extend the existing `Organization` model with the following nullable fields:
- `brand_logo` (`ImageField`): Supports PNG, JPG, SVG.
- `brand_name` (`CharField`): e.g., "Acme Corp Secure File Portal". Falls back to "Coneshare" dynamically on the frontend if empty.
- `brand_website_url` (`URLField`): The company's main website.

### Part 2: Backend API
1. **Admin Update Endpoint:**
   - Create a specific admin endpoint `PATCH /api/v1/admin/organization/` (or extend/expose an organization detail route under `core/admin_urls.py`) that updates the organization of the logged-in administrator (`request.user.organization`).
   - Must support `multipart/form-data` for handling the `brand_logo` image upload.
   - Restrict access to users with `role='admin'` or `role='owner'`.

2. **Public Configuration Endpoint:**
   - Instead of creating a new endpoint, extend the existing `PublicSettingsView` (`GET /api/v1/public/settings/`).
   - This endpoint will return:
     - `enable_public_signup` (existing)
     - `brand_name` (from the default organization: `Organization.objects.first()`)
     - `brand_logo` (media URL)
     - `brand_website_url`
   - This prevents duplicate network requests since the frontend already hits this endpoint on boot/login.

### Part 3: Frontend Admin UI (Dedicated Page)
To cleanly separate file uploads from the generic key-value `AppConfiguration` settings, we will create a dedicated page for branding.

- **File:** `frontend/src/pages/AdminBrandingPage.jsx`
- **Navigation:** Add a "Branding" link to the `<AdminNav />` component, positioning it alongside "Settings" and "Users".
- **UI Components:**
  - Drag-and-drop logo uploader with an image preview.
  - Text inputs for custom "Brand Name" and "Brand Website URL".
  - A live preview card rendering how the login header and internal navbar will look with the applied settings.

### Part 4: Frontend UI Integration & "Powered by" Footer
1. **Global `BrandingProvider` Context:**
   - Wrap the React App routing tree in a React Context provider (e.g. `BrandingProvider`).
   - The provider calls `authService.getPublicSettings()` on mount, sharing `brandName`, `brandLogo`, and `brandWebsiteUrl` globally across the app.

2. **Dynamic Branding Application:**
   - **Login/Signup/Upload Pages:** Replace hardcoded logos and headers with context values.
   - **Main Sidebar/Navbar:** Replace the top-left logo with the custom `brand_logo` and optional link redirection to `brand_website_url`.
   - **Document Title:** Update the document title dynamically to include `{brand_name}`.

3. **The Mandatory Open-Source Footer / Link:**
   - **Scrollable Pages (Login, Signup, Public Upload):** Display a standard bottom layout footer containing "This website is built on [Coneshare](https://github.com/coneshare/coneshare)".
   - **Full-screen Views (ShareLinkViewerPage, DataroomViewer):** Since these views utilize the full viewport (`h-screen`), place a subtle, low-opacity "Built on Coneshare" text link next to the top header logo/name layout block to avoid cluttering or obscuring document controls.

### Optional/Future Considerations
- **Email Templates:** Update backend Django HTML email templates (invitations, password resets) to dynamically inject `brand_name` in subjects and `brand_logo` in headers.
