import { expect, test, type Page } from '@playwright/test';

/** Any text file attaches; a binary is refused before anything is parsed. */
async function attach(page: Page, name: string, buffer: Buffer) {
	await page.getByTestId('add-context').click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByTestId('add-document').click();
	await (await chooser).setFiles([{ name, mimeType: 'application/octet-stream', buffer }]);
}

const pill = (page: Page, name: string) =>
	page.getByTestId('attachment-pill').filter({ hasText: name });
const toast = (page: Page, type: 'warning' | 'error') =>
	page.locator(`[data-sonner-toast][data-type="${type}"]`);

test.beforeEach(async ({ page }) => {
	await page.goto('/sessions');
});

test('reads a text file with an unknown extension, with a warning', async ({ page }) => {
	await attach(page, 'notes.wtf', Buffer.from('plain words in a strange file\n', 'utf-8'));
	await expect(pill(page, 'notes.wtf')).toBeVisible();
	await expect(toast(page, 'warning')).toContainText('read as plain text');
});

test('reads Markdown without a warning', async ({ page }) => {
	await attach(page, 'readme.md', Buffer.from('# Title\n\nBody.\n', 'utf-8'));
	await expect(pill(page, 'readme.md')).toBeVisible();
	await expect(toast(page, 'warning')).toHaveCount(0);
});

test('refuses a known binary by name', async ({ page }) => {
	await attach(page, 'tool.exe', Buffer.from([0x4d, 0x5a, 0, 0, 1, 2, 3]));
	await expect(toast(page, 'error')).toContainText('binary');
	await expect(pill(page, 'tool.exe')).toHaveCount(0);
});

test('refuses unrecognised binary content', async ({ page }) => {
	const bytes = Buffer.alloc(4096);
	for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
	await attach(page, 'blob.dat', bytes);
	await expect(toast(page, 'error')).toContainText('binary', { timeout: 15_000 });
	await expect(pill(page, 'blob.dat')).toHaveCount(0);
});
