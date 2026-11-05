import { test, expect } from '@playwright/test';

test.describe('File Requests', () => {

  test('should create a file request, accept public upload, and receive file in owner documents', async ({ page, browser }) => {
    const requestName = `Request-${Date.now()}`;
    const uploadFileName = `Vendor-Doc-${Date.now()}.txt`;

    // --- 1. Owner navigates to File Requests and creates a new request ---
    await page.goto('/file-requests');
    await expect(page.getByRole('heading', { level: 1, name: /file requests/i })).toBeVisible();

    await page.getByRole('button', { name: /create file request/i }).click();

    // Fill in FileRequestSheet form
    await page.locator('#name').fill(requestName);
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/file request created successfully/i).first()).toBeVisible();

    // --- 2. Copy the public upload URL ---
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const actionsButton = page.getByRole('button', { name: new RegExp(`Actions for ${requestName}`, 'i') });
    await expect(actionsButton).toBeVisible();
    await actionsButton.click();

    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/link copied to clipboard/i).first()).toBeVisible();

    const uploadUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(uploadUrl).toContain('/upload/');

    // --- 3. External Guest visits the upload page in clean context ---
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(uploadUrl);

    // Verify upload portal title matches the request
    await expect(guestPage.getByRole('heading', { name: requestName })).toBeVisible({ timeout: 15000 });

    // Fill in Guest uploader details
    await guestPage.locator('#uploaderName').fill('External Partner');
    await guestPage.locator('#uploaderEmail').fill('partner@example.com');

    // Attach external delivery file
    const fileInput = guestPage.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: uploadFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('External Vendor Handover Document Content'),
    });

    // Submit upload
    const uploadButton = guestPage.getByRole('button', { name: /upload.*file/i });
    await expect(uploadButton).toBeEnabled();
    await uploadButton.click();

    // Verify upload confirmation
    await expect(guestPage.getByRole('heading', { name: /upload complete/i })).toBeVisible({ timeout: 20000 });
    await guestContext.close();

    // --- 4. Back in Owner context, verify file landed in personal documents ---
    await page.goto('/documents');
    await expect(page.getByRole('heading', { level: 1, name: /documents/i })).toBeVisible();

    const receivedFileItem = page.getByRole('button', { name: uploadFileName, exact: true });
    await expect(receivedFileItem).toBeVisible({ timeout: 15000 });
  });

});
