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
    // Find the item for the document. This locator finds a div that contains our text.
    const documentItem = page.locator('div').filter({ hasText: /^Annual Report.pdf$/ }).first();
    await documentItem.hover();
    
    // The actions dropdown trigger is a button within the document item.
    await documentItem.getByRole('button').click();

    await page.getByText('Share').click();

    // The LinkSheet opens
    await expect(page.getByText('Create New Link')).toBeVisible();

    // Fill in the form and save
    await page.getByLabel('Name link').fill('Public Link');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    
    // Check for success toast
    await expect(page.getByText('Link created successfully.')).toBeVisible();
  });
});
