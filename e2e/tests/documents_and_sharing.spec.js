import { test, expect } from '@playwright/test';

test.describe('Documents and Sharing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the documents page before each test
    await page.goto('/documents');
    await expect(page.getByText('Client Reports')).toBeVisible();
    await expect(page.getByText('Annual Report.pdf')).toBeVisible();
  });

  test('should allow folder navigation', async ({ page }) => {
    await page.getByText('Client Reports').click();
    await expect(page).toHaveURL(/.*\/documents\/folders\/.*/);
  });

  test('should create a share link for a document', async ({ page }) => {
    // Navigate into the document detail page
    await page.getByText('Annual Report.pdf').click();
    await expect(page).toHaveURL(/.*\/documents\/.*/);

    // Click the "Create Link" button on the document page
    await page.getByRole('button', { name: 'Create Link' }).click();

    // The LinkSheet opens
    await expect(page.getByText('Create New Link')).toBeVisible();

    // Fill in the form and save
    await page.getByLabel('Name link').fill('Public Link');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Check for success toast
    await expect(page.getByText('Link created successfully.')).toBeVisible();
  });

  test('should create, view, and track a share link', async ({ page }) => {
    // Navigate into the document detail page
    await page.getByText('Annual Report.pdf').click();
    await expect(page).toHaveURL(/.*\/documents\/.*/);

    // --- Create a new share link ---
    await page.getByRole('button', { name: 'Create Link' }).click();
    await expect(page.getByText('Create New Link')).toBeVisible();
    await page.getByLabel('Name link').fill('Public Link');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Link created successfully.')).toBeVisible();

    // --- Verify link appears and get its URL ---
    await page.getByRole('tab', { name: 'Links and Permissions' }).click();
    const linkRow = page.getByRole('row', { name: /Public Link/ });
    await expect(linkRow).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await linkRow.getByRole('button', { name: 'Open actions menu' }).click();
    await page.getByRole('menuitem', { name: 'Copy Link' }).click();
    await expect(page.getByText('Link copied to clipboard!')).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    // --- View the link as a public user in a new session ---
    const viewerContext = await page.context().browser().newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(shareLinkUrl);
    await expect(viewerPage.getByText('Annual Report.pdf')).toBeVisible();
    await viewerContext.close();

    // --- Go back to the original page and check for the view session ---
    await page.getByRole('tab', { name: 'View Sessions' }).click();
    const viewsTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Visitor' }) });
    const viewRow = viewsTable.getByRole('row', { name: /Anonymous/ });
    await expect(viewRow).toBeVisible();
    await expect(viewRow.getByText('Public Link')).toBeVisible();
  });

});
