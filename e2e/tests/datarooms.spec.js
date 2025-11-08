import { test, expect } from '@playwright/test';

test.describe('Dataroom Management', () => {

  test('should create, view, add content to, and share a dataroom', async ({ page }) => {
    // --- 1. Create a Dataroom ---
    await page.goto('/datarooms');
    await page.getByRole('button', { name: 'Create Dataroom' }).click();

    // Fill in the form in the dialog
    await page.getByLabel('Name').fill('Project Phoenix');
    await page.getByRole('button', { name: 'Create' }).click();

    // Should navigate to the new dataroom page and show empty state
    await expect(page).toHaveURL(/.*\/datarooms\/.*/);
    await expect(page.getByRole('heading', { name: 'Project Phoenix' })).toBeVisible();
    await expect(page.getByText('This dataroom is empty')).toBeVisible();

    // --- 2. Add content to the Dataroom ---
    await page.getByRole('button', { name: 'Add Content' }).click();
    
    // In the "Add Content" dialog, find and select a document
    await expect(page.getByRole('heading', { name: 'Add Content to Dataroom' })).toBeVisible();
    // The checkbox is inside a div that contains the document name.
    const documentRow = page.locator('div').filter({ hasText: /^Annual Report.pdf$/ }).first();
    await documentRow.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Add 1 Item' }).click();

    // Verify the document now appears in the dataroom
    await expect(page.getByText('Content added to dataroom successfully.')).toBeVisible();
    await expect(page.getByText('Annual Report.pdf')).toBeVisible();

    // --- 3. Create a Share Link for the Dataroom ---
    await page.getByRole('tab', { name: 'Links and Permissions' }).click();
    await page.getByRole('button', { name: 'Create Link' }).click();

    // The LinkSheet opens
    await expect(page.getByText('Create New Link')).toBeVisible();

    // Fill in the form and save
    await page.getByLabel('Name link').fill('Dataroom Public Link');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    
    // Check for success toast and that the link appears in the table
    await expect(page.getByText('Link created successfully.')).toBeVisible();
    const linksTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Settings' }) });
    await expect(linksTable.getByRole('cell', { name: 'Dataroom Public Link' })).toBeVisible();
  });

  test('should navigate to dataroom page from the main listing', async ({ page }) => {
    // First, create a dataroom to ensure one exists
    await page.goto('/datarooms');
    await page.getByRole('button', { name: 'Create Dataroom' }).click();
    await page.getByLabel('Name').fill('Project Dragon');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'Project Dragon' })).toBeVisible();
    
    // Go back to the listing page
    await page.goto('/datarooms');

    // Find and click the dataroom in the list
    await page.getByText('Project Dragon').click();
    
    // Verify navigation to the correct dataroom page
    await expect(page).toHaveURL(/.*\/datarooms\/.*/);
    await expect(page.getByRole('heading', { name: 'Project Dragon' })).toBeVisible();
  });
});
