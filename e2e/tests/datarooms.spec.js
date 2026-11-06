import { test, expect } from '@playwright/test';

test.describe('Dataroom Management', () => {

  test('should create, view, add content to, and share a dataroom', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Happy-${Date.now()}`;
    const linkName = `Link-${Date.now()}`;

    // --- 1. Create a Dataroom ---
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();

    // Fill in the form in the dialog
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    // Should see the new dataroom card in the list and click it to enter
    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();

    // Should navigate to the new dataroom page and show empty state
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: dataroomName })).toBeVisible();
    await expect(page.getByText(/this dataroom is empty/i)).toBeVisible();

    // --- 2. Add content to the Dataroom ---
    await page.getByRole('button', { name: /add content/i }).first().click();

    // In the "Add Content" dialog, find and select a document
    await expect(page.getByRole('heading', { name: /add content/i })).toBeVisible();
    // Select the first available checkbox
    const firstCheckbox = page.locator('div[role="dialog"] button[role="checkbox"], div[role="dialog"] input[type="checkbox"]').first();
    await firstCheckbox.click();
    await page.getByRole('button', { name: /add \d+ item/i }).click();

    // Verify content added
    await expect(page.getByText(/content added to dataroom successfully/i)).toBeVisible();

    // --- 3. Create a Share Link for the Dataroom ---
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();

    // The LinkSheet opens
    await expect(page.getByText(/create new link/i)).toBeVisible();

    // Fill in the form and save
    await page.getByLabel(/name link/i).fill(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();

    // Check for success toast and that the link appears in the table
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: linkName })).toBeVisible();

    // --- 4. Copy share link and open as Anonymous Guest in incognito context ---
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify Dataroom public portal loads
    await expect(guestPage.getByText(dataroomName).first()).toBeVisible({ timeout: 15000 });
    await guestPage.waitForTimeout(1000); // Allow telemetry beacon to flush
    await guestContext.close();

    // --- 5. Back in Owner context, verify Dataroom view session telemetry ---
    await page.reload();
    await expect(page.getByRole('cell', { name: /anonymous|you/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: linkName }).first()).toBeVisible();
  });

  test('should navigate to dataroom page from the main listing', async ({ page }) => {
    const dataroomName = `Dataroom-Nav-${Date.now()}`;

    // First, create a dataroom to ensure one exists
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    // Find and click the dataroom card in the list
    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();

    // Verify navigation to the correct dataroom page
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: dataroomName })).toBeVisible();
  });
});

