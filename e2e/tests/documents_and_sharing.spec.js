import { test, expect } from '@playwright/test';

test.describe('Documents and Sharing', () => {

  test('should allow folder creation and navigation', async ({ page }) => {
    const folderName = `Folder-${Date.now()}`;

    await page.goto('/documents');
    await expect(page.getByRole('heading', { level: 1, name: /documents/i })).toBeVisible();

    // Create a new folder
    const newFolderBtn = page.getByRole('button', { name: /new folder/i }).or(page.getByTitle(/new folder/i));
    await newFolderBtn.click();

    // In AddFolderDialog
    await page.getByLabel(/folder name|name/i).fill(folderName);
    await page.getByRole('button', { name: /new folder/i }).click();

    // Verify folder appears and click to navigate
    const folderItem = page.getByRole('button', { name: folderName, exact: true });
    await expect(folderItem).toBeVisible();
    await folderItem.click();

    // Verify URL navigated to folder
    await expect(page).toHaveURL(/.*\/documents\/folders\/.+/);
    await expect(page.getByRole('navigation', { name: /breadcrumb/i }).getByText(folderName, { exact: true })).toBeVisible();
  });

  test('should create, view, and track a share link', async ({ page, browser }) => {
    const linkName = `Link-${Date.now()}`;

    await page.goto('/documents');
    await expect(page.getByRole('heading', { level: 1, name: /documents/i })).toBeVisible();

    // Pick an existing document, or upload one if none exist
    let targetDoc = page.locator('button').filter({ hasText: /\.(pdf|txt|png|jpg|docx)$/i }).first();
    if ((await targetDoc.count()) === 0) {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: `Smoke-Doc-${Date.now()}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from('ConeShare E2E Smoke Test Content'),
      });
      targetDoc = page.locator('button').filter({ hasText: /\.(pdf|txt|png|jpg|docx)$/i }).first();
    }

    await expect(targetDoc).toBeVisible({ timeout: 15000 });
    await targetDoc.click();

    // Navigate to document detail page
    await expect(page).toHaveURL(/.*\/documents\/.+/);

    // --- Create a new share link ---
    await page.getByRole('button', { name: /get link|create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    await page.getByLabel(/name link/i).fill(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();

    // --- Verify link appears in links table and copy its URL ---
    await expect(page.getByRole('cell', { name: linkName })).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    // --- View the link as a public user in a new incognito session (clean cookies) ---
    const viewerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(shareLinkUrl);
    await expect(viewerPage.locator('body')).not.toContainText('404');
    await viewerPage.waitForTimeout(1000); // Allow tracking beacon to flush
    await viewerContext.close();

    // --- Back in owner context, verify view session was logged ---
    await page.reload();
    await expect(page.getByRole('cell', { name: /anonymous|you/i }).first()).toBeVisible({ timeout: 10000 });
    // Link name appears in both the Share Links table and the View Sessions table
    await expect(page.getByRole('cell', { name: linkName }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: linkName }).nth(1)).toBeVisible();
  });

  test('should enforce password protection gate before granting document access', async ({ page, browser }) => {
    const linkName = `Pwd-Link-${Date.now()}`;
    const password = 'ConeshareSecret123!';

    await page.goto('/documents');
    await expect(page.getByRole('heading', { level: 1, name: /documents/i })).toBeVisible();

    // Pick an existing document
    const targetDoc = page.locator('button').filter({ hasText: /\.(pdf|txt|png|jpg|docx)$/i }).first();
    await expect(targetDoc).toBeVisible({ timeout: 15000 });
    await targetDoc.click();
    await expect(page).toHaveURL(/.*\/documents\/.+/);

    // --- Create a password-protected share link ---
    await page.getByRole('button', { name: /get link|create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    await page.getByLabel(/name link/i).fill(linkName);

    // Enable password protection
    const passwordSwitch = page.locator('#password-enabled');
    await passwordSwitch.click();
    await page.locator('input#password').fill(password);

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();

    // Copy link URL
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    // --- Guest attempts access in isolated context ---
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify Password Gate is displayed and document is NOT visible
    await expect(guestPage.getByRole('heading', { name: /enter.*password/i })).toBeVisible({ timeout: 15000 });
    const pwdInput = guestPage.locator('input#password');

    // 1. Submit WRONG password
    await pwdInput.fill('WrongSecret999');
    await guestPage.getByRole('button', { name: /continue/i }).click();
    // Verify still gated
    await expect(guestPage.getByRole('heading', { name: /enter.*password/i })).toBeVisible();

    // 2. Submit CORRECT password
    await pwdInput.fill(password);
    await guestPage.getByRole('button', { name: /continue/i }).click();

    // Verify gate unlocks and viewer loads
    await expect(guestPage.locator('body')).not.toContainText('404');
    await expect(guestPage.getByRole('heading', { name: /enter.*password/i })).not.toBeVisible({ timeout: 15000 });

    await guestContext.close();
  });

});
