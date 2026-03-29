import { test, expect } from '@playwright/test';

test.describe('Jira Killer - Luna Chat Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3005/login');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      console.log('Already logged in, skipping login...');
      return;
    }
    
    // Fill login form
    await page.fill('input[type="email"]', 'guilherme11.gr@gmail.com');
    await page.fill('input[type="password"]', 'mesmerize');
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for redirect after login
    await page.waitForURL('**/projects**', { timeout: 10000 });
    
    console.log('Logged in successfully!');
  });

  test('explore Kai page structure', async ({ page }) => {
    // Navigate to Kai page
    await page.goto('http://localhost:3005/kai');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ path: 'kai-page.png', fullPage: true });
    
    // Get page content
    const content = await page.content();
    console.log('Kai page loaded');
    
    // Look for chat elements
    const chatInput = await page.$('input[type="text"], textarea');
    const chatMessages = await page.$$('[class*="message"], [class*="chat"]');
    
    console.log(`Found ${chatMessages.length} message elements`);
    console.log(`Chat input found: ${!!chatInput}`);
  });

  test('check projects page for ideas', async ({ page }) => {
    // Navigate to projects page
    await page.goto('http://localhost:3005/projects');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ path: 'projects-page.png', fullPage: true });
    
    // Look for ideas or similar sections
    const pageContent = await page.content();
    console.log('Projects page loaded');
  });
});
