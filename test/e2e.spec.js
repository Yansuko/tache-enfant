import { test, expect } from '@playwright/test';

test.describe('E2E - User Flows', () => {
  test('Parent can login and view family', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Fill login form
    await page.fill('input[placeholder*="email"]', 'parent@demo.fr');
    await page.fill('input[placeholder*="password"]', 'demo');
    await page.click('button:has-text("Connexion")');

    // Wait for family to load
    await page.waitForSelector('text=Famille Démo');

    // Verify children are displayed
    const childCount = await page.locator('.child-item').count();
    expect(childCount).toBeGreaterThan(0);
  });

  test('Child can login with PIN and complete task', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Switch to child mode
    await page.click('input[value="enfant"]');
    await page.click('button:has-text("Enfant")');

    // Enter PIN
    await page.fill('input[placeholder*="PIN"]', '0000');
    await page.click('button:has-text("Déverrouiller")');

    // Wait for tasks to load
    await page.waitForSelector('.task-item');

    // Complete a task
    const firstTask = await page.locator('.task-checkbox').first();
    await firstTask.click();

    // Verify task shows as done
    await expect(firstTask).toHaveClass(/done/);
  });
});
