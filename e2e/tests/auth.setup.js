import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill('test@coneshare.com');
  await page.getByPlaceholder('••••••••').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for the main page to load by checking for the Dashboard link.
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

  // Save the authentication state to the file.
  await page.context().storageState({ path: authFile });
});
