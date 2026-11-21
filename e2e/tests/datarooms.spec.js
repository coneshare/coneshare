import { test, expect } from '@playwright/test';

test.describe('Dataroom Management', () => {
  test.describe.configure({ mode: 'serial' });

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
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
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

  test('should allow creating nested folders and navigating via breadcrumbs', async ({ page }) => {
    const dataroomName = `Dataroom-Breadcrumbs-${Date.now()}`;
    const folderAlpha = `Alpha-${Date.now()}`;
    const folderBeta = `Beta-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create Alpha folder at root
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await expect(createFolderBtn).toBeVisible();
    await createFolderBtn.click();

    await page.getByLabel(/folder name|name/i).fill(folderAlpha);
    await page.getByRole('button', { name: /new folder|create/i }).click();

    // Verify Alpha folder appears
    const alphaItem = page.getByRole('button', { name: folderAlpha, exact: true });
    await expect(alphaItem).toBeVisible();

    // 3. Navigate into Alpha folder
    await alphaItem.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.*folder=.+/);

    // 4. Create Beta nested folder inside Alpha
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(folderBeta);
    await page.getByRole('button', { name: /new folder|create/i }).click();

    const betaItem = page.getByRole('button', { name: folderBeta, exact: true });
    await expect(betaItem).toBeVisible();

    // 5. Navigate back to root via header breadcrumb
    const rootBreadcrumb = page.getByRole('navigation', { name: /breadcrumb/i }).getByRole('button', { name: dataroomName });
    await expect(rootBreadcrumb).toBeVisible();
    await rootBreadcrumb.click();

    // Verify back at root where Alpha folder is listed and Beta is not
    await expect(page).not.toHaveURL(/.*folder=.+/);
    await expect(page.getByRole('button', { name: folderAlpha, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: folderBeta, exact: true })).not.toBeVisible();
  });

  test('should allow renaming a folder in dataroom', async ({ page }) => {
    const dataroomName = `Dataroom-Rename-${Date.now()}`;
    const oldFolderName = `OldFolder-${Date.now()}`;
    const newFolderName = `NewFolder-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create folder
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(oldFolderName);
    await page.getByRole('button', { name: /new folder|create/i }).click();

    await expect(page.getByRole('button', { name: oldFolderName, exact: true })).toBeVisible();

    // 3. Open Actions dropdown and click Rename
    const actionsBtn = page.getByRole('button', { name: `Actions for ${oldFolderName}` });
    await actionsBtn.click();

    await page.getByRole('menuitem', { name: /rename/i }).click();

    // 4. Fill in new name in RenameItemDialog and submit
    const renameInput = page.locator('div[role="dialog"] input#name');
    await expect(renameInput).toBeVisible();
    await renameInput.fill(newFolderName);
    await page.locator('div[role="dialog"]').getByRole('button', { name: /rename/i }).click();

    // 5. Verify the folder name is updated in the list
    await expect(page.getByRole('button', { name: newFolderName, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: oldFolderName, exact: true })).not.toBeVisible();
  });

  test('should allow public visitor to view dataroom, navigate folders and view document inline', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Viewer-${Date.now()}`;
    const folderName = `ViewerFolder-${Date.now()}`;
    const linkName = `Link-Viewer-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create a subfolder
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(folderName);
    await page.getByRole('button', { name: /new folder|create/i }).click();
    await expect(page.getByRole('button', { name: folderName, exact: true })).toBeVisible();

    // 3. Upload a document directly into Dataroom
    const docName = `Doc-${Date.now()}.txt`;
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: docName,
      mimeType: 'text/plain',
      buffer: Buffer.from('ConeShare Dataroom E2E Content'),
    });
    await expect(page.getByText(docName)).toBeVisible({ timeout: 15000 });

    // 4. Create a Share Link for the Dataroom
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    await page.getByLabel(/name link/i).fill(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 5. Copy the link URL
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const linkRow = page.getByRole('row').filter({ hasText: linkName });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    // 6. Access as public guest in clean incognito session
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify Dataroom header and folder visible
    await expect(guestPage.getByText(dataroomName).first()).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText(folderName).first()).toBeVisible();

    // 7. Click on document to view inline
    await expect(guestPage.getByText(docName).first()).toBeVisible({ timeout: 15000 });
    const viewDocBtn = guestPage.getByRole('button', { name: /view document|watch video/i }).first();
    await viewDocBtn.click();

    // Verify inline viewer loads (URL contains dataroom_document_id parameter)
    await expect(guestPage).toHaveURL(/.*dataroom_document_id=.+/);

    // 8. Navigate back to root via the Home breadcrumb button
    const homeBtn = guestPage.getByRole('button', { name: /home/i }).first();
    await expect(homeBtn).toBeVisible();
    await homeBtn.click();

    // Verify back in folder listing
    await expect(guestPage).not.toHaveURL(/.*dataroom_document_id=.+/);
    await expect(guestPage.getByText(folderName).first()).toBeVisible();

    await guestContext.close();
  });

  test('should allow public visitor to ask a question and owner to view it in QnA tab', async ({ page, browser }) => {
    const dataroomName = `Dataroom-QnA-${Date.now()}`;
    const linkName = `Link-QnA-${Date.now()}`;
    const questionSubject = `Question-${Date.now()}`;
    const questionBody = 'Could you please verify the numbers in this document?';

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Upload a test document directly
    const docName = `Doc-QnA-${Date.now()}.txt`;
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: docName,
      mimeType: 'text/plain',
      buffer: Buffer.from('ConeShare Q&A Test Content'),
    });
    await expect(page.getByText(docName)).toBeVisible({ timeout: 15000 });

    // 3. Create Share Link
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    await page.getByLabel(/name link/i).fill(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 4. Copy share link
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const linkRow = page.getByRole('row').filter({ hasText: linkName });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /copy link/i }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();

    const shareLinkUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareLinkUrl).toContain('/view/');

    // 5. Open as public visitor in clean incognito session
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Wait for document to be visible in guest page
    await expect(guestPage.getByText(docName).first()).toBeVisible({ timeout: 15000 });

    // Click the Ask Question button on the document card
    const askBtn = guestPage.getByTitle(/ask question/i).first();
    await expect(askBtn).toBeVisible();
    await askBtn.click();

    // 6. Fill and submit the Q&A thread in QnAPanel
    const subjectInput = guestPage.getByPlaceholder(/subject|brief summary/i).or(guestPage.getByLabel(/question subject/i));
    await expect(subjectInput).toBeVisible();
    await subjectInput.fill(questionSubject);

    const messageInput = guestPage.getByPlaceholder(/ask a question|write your message/i).or(guestPage.getByLabel(/question message/i));
    await messageInput.fill(questionBody);

    await guestPage.getByRole('button', { name: /^ask$|^send$/i }).click();

    // Verify question thread appears in visitor panel
    await expect(guestPage.getByText(questionSubject).first()).toBeVisible({ timeout: 10000 });
    await guestContext.close();

    // 7. Back in Owner context, switch to Q&A tab and verify the question appears
    await page.getByRole('tab', { name: /q&a/i }).click();
    await expect(page.getByText(questionSubject).first()).toBeVisible({ timeout: 15000 });
  });

  test('should allow moving an item into another folder in dataroom', async ({ page }) => {
    const dataroomName = `Dataroom-Move-${Date.now()}`;
    const targetFolderName = `Target-${Date.now()}`;
    const moveDocName = `MoveDoc-${Date.now()}.txt`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create Target folder
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(targetFolderName);
    await page.getByRole('button', { name: /new folder|create/i }).click();
    await expect(page.getByRole('button', { name: targetFolderName, exact: true })).toBeVisible();

    // 3. Upload a document directly at root
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: moveDocName,
      mimeType: 'text/plain',
      buffer: Buffer.from('ConeShare Move Test Content'),
    });
    await expect(page.getByText(moveDocName)).toBeVisible({ timeout: 15000 });

    // 4. Select the document row (click row background or container, not name)
    const docRow = page.locator(`[data-testid^="draggable-item-"]`).filter({ hasText: moveDocName });
    await docRow.click();

    // 5. Click Move in SelectionActionBar
    const moveBtn = page.getByRole('button', { name: 'Move', exact: true });
    await expect(moveBtn).toBeVisible();
    await moveBtn.click();

    // 6. In MoveDestinationDialog, pick the target folder
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: targetFolderName, exact: true }).click();

    // 7. Click confirm Move button inside dialog
    await dialog.getByRole('button', { name: /move to folder|move/i }).click();

    // 8. Verify the document is moved out of root
    await expect(page.locator(`[data-testid^="draggable-item-"]`).filter({ hasText: moveDocName })).not.toBeVisible();

    // 9. Navigate into Target folder and verify document is present
    await page.getByRole('button', { name: targetFolderName, exact: true }).click();
    await expect(page).toHaveURL(/.*folder=.+/);
    await expect(page.getByText(moveDocName)).toBeVisible();
  });

  test('should allow removing content from dataroom without deleting original document', async ({ page }) => {
    const dataroomName = `Dataroom-Remove-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Add an existing document from library to Dataroom
    await page.getByRole('button', { name: /add content/i }).first().click();
    await expect(page.getByRole('heading', { name: /add content/i })).toBeVisible();

    const dialog = page.locator('div[role="dialog"]');
    const docCheckbox = dialog.locator('button[role="checkbox"][id^="doc-"]').first();
    await expect(docCheckbox).toBeVisible();
    const docName = (await docCheckbox.getAttribute('aria-label')).trim();

    await docCheckbox.click();
    await page.getByRole('button', { name: /add \d+ item/i }).click();
    await expect(page.getByText(/content added to dataroom successfully/i)).toBeVisible();

    // Verify document appears in Dataroom
    const dataroomDoc = page.locator(`[data-testid^="draggable-item-"]`).filter({ hasText: docName }).first();
    await expect(dataroomDoc).toBeVisible();

    // 3. Select the document and remove it via SelectionActionBar
    await dataroomDoc.click();
    const removeBtn = page.getByRole('button', { name: 'Remove', exact: true });
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // Confirm in ConfirmationDialog
    const confirmDialog = page.locator('div[role="dialog"]');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove', exact: true }).click();

    // 4. Verify the document is removed from Dataroom
    await expect(page.locator(`[data-testid^="draggable-item-"]`).filter({ hasText: docName })).not.toBeVisible();

    // 5. Navigate back to /documents and verify the original file still exists in the library
    await page.goto('/documents');
    await expect(page.getByRole('heading', { level: 1, name: /documents/i })).toBeVisible();
    await expect(page.getByText(docName).first()).toBeVisible();
  });

  test('should enforce granular visibility and download settings on share link', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Perm-${Date.now()}`;
    const secretFolderName = `SecretFolder-${Date.now()}`;
    const publicDocName = `PublicDoc-${Date.now()}.txt`;
    const linkName = `Link-Perm-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create SecretFolder
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(secretFolderName);
    await page.getByRole('button', { name: /new folder|create/i }).click();
    await expect(page.getByRole('button', { name: secretFolderName, exact: true })).toBeVisible();

    // 3. Upload PublicDoc directly
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: publicDocName,
      mimeType: 'text/plain',
      buffer: Buffer.from('ConeShare Permissions Content'),
    });
    await expect(page.getByText(publicDocName)).toBeVisible({ timeout: 15000 });

    // 4. Create Share Link
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    const nameInput = page.getByLabel(/name link/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(linkName);
    await expect(nameInput).toHaveValue(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 5. Open Manage Permissions dialog for this link
    const linkRow = page.getByRole('row').filter({ hasText: linkName });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    await linkRow.getByRole('button', { name: /actions/i }).click();
    await page.getByRole('menuitem', { name: /manage permissions/i }).click();

    const permDialog = page.locator('div[role="dialog"]');
    await expect(permDialog).toBeVisible();

    // In Manage Permissions, find SecretFolder row and toggle off Visible
    const folderPermRow = permDialog.locator('.grid').filter({ hasText: secretFolderName }).first();
    await expect(folderPermRow).toBeVisible();
    const folderVisibleCheckbox = folderPermRow.locator('button[role="checkbox"]').first();
    await folderVisibleCheckbox.click();

    // Find PublicDoc row and toggle off Download
    const docPermRow = permDialog.locator('.grid').filter({ hasText: publicDocName }).first();
    await expect(docPermRow).toBeVisible();
    const docDownloadCheckbox = docPermRow.locator('button[role="checkbox"]').nth(1);
    await docDownloadCheckbox.click();

    // Save permissions
    await permDialog.getByRole('button', { name: /save changes/i }).click();
    await expect(permDialog).not.toBeVisible({ timeout: 10000 });

    // 6. Get share link URL
    const shareLinkUrl = await linkRow.locator('[title*="/view/"]').first().getAttribute('title');
    expect(shareLinkUrl).toContain('/view/');

    // 7. Open as public guest
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify Dataroom header loads
    await expect(guestPage.getByText(dataroomName).first()).toBeVisible({ timeout: 15000 });

    // Verify SecretFolder is NOT visible to guest
    await expect(guestPage.getByText(secretFolderName)).not.toBeVisible();

    // Verify PublicDoc IS visible to guest
    await expect(guestPage.getByText(publicDocName).first()).toBeVisible();

    // Verify PublicDoc does NOT have a download button on its card
    const docCard = guestPage.locator('article').filter({ hasText: publicDocName });
    await expect(docCard).toBeVisible();
    await expect(docCard.getByTitle(/download/i)).not.toBeVisible();

    await guestContext.close();
  });

  test('should switch between sibling documents via navigation controls in viewer', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Sibling-${Date.now()}`;
    const linkName = `Link-Sibling-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Add two documents via Add Content
    await page.getByRole('button', { name: /add content/i }).first().click();
    await expect(page.getByRole('heading', { name: /add content/i })).toBeVisible();

    const addDialog = page.locator('div[role="dialog"]');
    const docCheckboxes = addDialog.locator('button[role="checkbox"][id^="doc-"]');
    await expect(docCheckboxes.nth(0)).toBeVisible();
    await expect(docCheckboxes.nth(1)).toBeVisible();
    const docOneName = (await docCheckboxes.nth(0).getAttribute('aria-label')).trim();
    const docTwoName = (await docCheckboxes.nth(1).getAttribute('aria-label')).trim();

    await docCheckboxes.nth(0).click();
    await docCheckboxes.nth(1).click();
    await page.getByRole('button', { name: /add \d+ items/i }).click();
    await expect(page.getByText(/content added to dataroom successfully/i)).toBeVisible();

    // Verify both documents appear in Dataroom
    const dataroomDocs = page.locator('[data-testid^="draggable-item-"]');
    await expect(dataroomDocs.filter({ hasText: docOneName }).first()).toBeVisible();
    await expect(dataroomDocs.filter({ hasText: docTwoName }).first()).toBeVisible();

    // 3. Create Share Link
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    const nameInput = page.getByLabel(/name link/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(linkName);
    await expect(nameInput).toHaveValue(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 4. Get share link URL
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    const shareLinkUrl = await linkRow.locator('[title*="/view/"]').first().getAttribute('title');
    expect(shareLinkUrl).toContain('/view/');

    // 5. Open as guest in incognito context
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify both documents exist on guest page
    await expect(guestPage.getByText(docOneName).first()).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText(docTwoName).first()).toBeVisible();

    // Click first document to view inline
    const firstDocCard = guestPage.locator('article').filter({ hasText: docOneName });
    await firstDocCard.getByRole('button', { name: /view document/i }).click();

    // Verify first document is loaded in inline viewer
    await expect(guestPage).toHaveURL(/.*dataroom_document_id=.+/);
    await expect(guestPage.locator('nav').getByText(docOneName)).toBeVisible();

    // 6. Click Next File button to navigate to second document
    const nextBtn = guestPage.getByTitle(/next file/i);
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Verify navigated to second document
    await expect(guestPage.locator('nav').getByText(docTwoName)).toBeVisible();

    // 7. Click Previous File button to navigate back to first document
    const prevBtn = guestPage.getByTitle(/previous file/i);
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();

    // Verify returned to first document
    await expect(guestPage.locator('nav').getByText(docOneName)).toBeVisible();

    await guestContext.close();
  });

  test('should download folder as zip from public dataroom viewer', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Zip-${Date.now()}`;
    const zipFolderName = `ZipFolder-${Date.now()}`;
    const docName = `File-${Date.now()}.txt`;
    const linkName = `Link-Zip-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Create a folder in Dataroom
    const createFolderBtn = page.getByTitle(/new folder|create folder/i);
    await createFolderBtn.click();
    await page.getByLabel(/folder name|name/i).fill(zipFolderName);
    await page.getByRole('button', { name: /new folder|create/i }).click();
    await expect(page.getByRole('button', { name: zipFolderName, exact: true })).toBeVisible();

    // 3. Enter the folder and wait until folder view is active
    await page.getByRole('button', { name: zipFolderName, exact: true }).click();
    await expect(page).toHaveURL(/.*folder=.+/);
    await expect(page.getByRole('button', { name: /back to parent/i })).toBeVisible();
    await expect(page.getByText(/this folder is empty/i)).toBeVisible();

    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: docName,
      mimeType: 'text/plain',
      buffer: Buffer.from('ConeShare ZIP Folder File Content'),
    });
    await expect(page.getByText(docName)).toBeVisible({ timeout: 15000 });

    // 4. Return to root via "Back to parent" button
    const backBtn = page.getByRole('button', { name: /back to parent/i });
    await backBtn.click();
    await expect(page).not.toHaveURL(/.*folder=.+/);

    // 5. Create Share Link
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();
    const nameInput = page.getByLabel(/name link/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(linkName);
    await expect(nameInput).toHaveValue(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 6. Get share link URL
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    const shareLinkUrl = await linkRow.locator('[title*="/view/"]').first().getAttribute('title');
    expect(shareLinkUrl).toContain('/view/');

    // 7. Open as public guest in clean incognito session
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Wait for the folder to be visible
    await expect(guestPage.getByText(zipFolderName).first()).toBeVisible({ timeout: 15000 });

    // 8. Open Actions menu for the folder
    const folderActionsBtn = guestPage.locator(`button[aria-label="Actions for ${zipFolderName}"]`);
    await expect(folderActionsBtn).toBeVisible();
    await folderActionsBtn.click();

    // 9. Trigger download and assert .zip file received
    const downloadPromise = guestPage.waitForEvent('download');
    await guestPage.getByRole('menuitem', { name: /download/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(zipFolderName);
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
    expect(await download.failure()).toBeNull();

    await guestContext.close();
  });

  test('should enforce password, NDA gate, and dynamic watermark on dataroom viewer', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Gate-${Date.now()}`;
    const docName = `Doc-Protected-${Date.now()}.txt`;
    const linkName = `Link-Gate-${Date.now()}`;
    const password = 'GateSecretPass123!';
    const ndaText = 'Strictly confidential dataroom materials agreement.';

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Upload a direct file
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').first();
    await fileInput.setInputFiles({
      name: docName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Protected Content with Watermark'),
    });
    await expect(page.getByText(docName)).toBeVisible({ timeout: 15000 });

    // 3. Create Share Link with Password, NDA and Watermark
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();

    const nameInput = page.getByLabel(/name link/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(linkName);
    await expect(nameInput).toHaveValue(linkName);

    // Enable Password Protection
    await page.locator('#password-enabled').click();
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(password);

    // Enable NDA
    await page.locator('#nda-enabled').click();
    const ndaTextarea = page.locator('#nda-text');
    await expect(ndaTextarea).toBeVisible();
    await ndaTextarea.fill(ndaText);

    // Enable Watermark
    await page.locator('#enable-watermark').click();
    const watermarkInput = page.locator('#watermark-text');
    await expect(watermarkInput).toBeVisible();
    await watermarkInput.fill('CONFIDENTIAL {{ip-address}}');

    // Save changes
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 4. Get share link URL
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    const shareLinkUrl = await linkRow.locator('[title*="/view/"]').first().getAttribute('title');
    expect(shareLinkUrl).toContain('/view/');

    // 5. Open as public guest in clean incognito session
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // --- GATE 1: Password Verification ---
    // Content should not be visible yet
    const guestPasswordInput = guestPage.locator('input#password');
    await expect(guestPasswordInput).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText(docName)).not.toBeVisible();

    // Enter password and submit
    await guestPasswordInput.fill(password);
    await guestPage.getByRole('button', { name: /continue/i }).click();

    // --- GATE 2: NDA Agreement ---
    // Content should still not be visible yet
    await expect(guestPage.getByText(/confidentiality/i).first()).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText(ndaText)).toBeVisible();
    await expect(guestPage.getByText(docName)).not.toBeVisible();

    // Agree and enter
    const agreeCheckbox = guestPage.locator('input[type="checkbox"]');
    await agreeCheckbox.click();
    await guestPage.getByRole('button', { name: /accept & view|accept and view/i }).click();

    // --- POST-GATES: Dataroom Access & Watermark Verification ---
    await expect(guestPage.getByText(dataroomName).first()).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText(docName).first()).toBeVisible();
    await expect(guestPage.getByText(/watermarked/i).first()).toBeVisible();

    await guestContext.close();
  });

  test('should invite a collaborator and remove them from dataroom', async ({ page }) => {
    const dataroomName = `Dataroom-Collab-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Open Collaborators Dialog
    await page.getByRole('button', { name: /collaborators/i }).first().click();
    const collabDialog = page.locator('div[role="dialog"]');
    await expect(collabDialog).toBeVisible();
    await expect(collabDialog.getByText(/manage collaborators/i)).toBeVisible();

    // 3. Select an eligible organization member from dropdown
    const memberBtn = collabDialog.locator('button[type="button"]').filter({ hasText: /colleague@coneshare\.com|@/i }).first();
    await expect(memberBtn).toBeVisible({ timeout: 15000 });
    const memberText = (await memberBtn.textContent()).trim();
    await memberBtn.click();

    // 4. Click Add Collaborators button
    const addCollabBtn = collabDialog.getByRole('button', { name: /add collaborators/i });
    await expect(addCollabBtn).toBeVisible();
    await addCollabBtn.click();
    await expect(page.getByText(/successfully added collaborator/i)).toBeVisible();

    // 5. Verify the collaborator is now listed in the Collaborators section
    const removeBtn = collabDialog.getByTitle(/remove collaborator/i);
    await expect(removeBtn).toBeVisible();

    // 6. Remove the collaborator
    await removeBtn.click();

    // Confirm in ConfirmationDialog
    const confirmDialog = page.getByRole('dialog', { name: /remove .* from this dataroom/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText(/collaborator removed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(collabDialog.getByTitle(/remove collaborator/i)).not.toBeVisible({ timeout: 15000 });
  });

  test('should configure banner gallery mode, upload images, and display in viewer', async ({ page, browser }) => {
    const dataroomName = `Dataroom-Gallery-${Date.now()}`;
    const linkName = `Link-Gallery-${Date.now()}`;

    // 1. Create a Dataroom
    await page.goto('/datarooms');
    await page.getByRole('button', { name: /add dataroom/i }).first().click();
    await page.getByLabel(/name/i).fill(dataroomName);
    await page.getByRole('button', { name: /create dataroom/i }).click();

    const dataroomCard = page.getByRole('heading', { level: 3, name: dataroomName });
    await expect(dataroomCard).toBeVisible();
    await dataroomCard.click();
    await expect(page).toHaveURL(/.*\/datarooms\/.+/);

    // 2. Navigate to Settings Tab
    await page.getByRole('tab', { name: /settings/i }).click();
    await expect(page.getByRole('heading', { level: 3, name: /banner mode/i })).toBeVisible();

    // 3. Switch to Banner Gallery mode
    const galleryModeBtn = page.getByRole('button', { name: /banner gallery/i });
    await expect(galleryModeBtn).toBeVisible();
    await galleryModeBtn.click();

    // 4. Verify gallery manager is displayed
    await expect(page.getByText(/no banner images uploaded yet/i)).toBeVisible();

    // 5. Upload a banner image to the gallery
    const samplePngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const galleryInput = page.locator('input[accept*="image/jpeg"]');
    await galleryInput.setInputFiles({
      name: 'gallery-banner-1.png',
      mimeType: 'image/png',
      buffer: samplePngBuffer,
    });

    // Verify uploaded image appears in gallery manager with badge #1
    await expect(page.getByText('#1')).toBeVisible({ timeout: 15000 });

    // 6. Create Share Link
    await page.getByRole('tab', { name: /share links/i }).click();
    await page.getByRole('button', { name: /create link/i }).click();
    await expect(page.getByText(/create new link/i)).toBeVisible();

    const nameInput = page.getByLabel(/name link/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill(linkName);
    await expect(nameInput).toHaveValue(linkName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/link created successfully/i)).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

    // 7. Get share link URL
    const linkRow = page.getByRole('row', { name: new RegExp(linkName) });
    await expect(linkRow).toBeVisible({ timeout: 15000 });
    const shareLinkUrl = await linkRow.locator('[title*="/view/"]').first().getAttribute('title');
    expect(shareLinkUrl).toContain('/view/');

    // 8. Open as public guest in clean incognito session
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(shareLinkUrl);

    // Verify Dataroom header and banner image are visible to guest
    await expect(guestPage.getByText(dataroomName).first()).toBeVisible({ timeout: 15000 });
    const bannerImg = guestPage.locator('img[alt*="banner"]');
    await expect(bannerImg).toBeVisible({ timeout: 15000 });
    const bannerSrc = await bannerImg.getAttribute('src');
    expect(bannerSrc).toBeTruthy();

    await guestContext.close();
  });
});





