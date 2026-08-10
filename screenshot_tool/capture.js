const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📸 ${name}.png saved`);
  return file;
}

async function login(page) {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Fill phone number (first input on page)
  await page.locator('input').first().fill('9000000001');
  // Click Send OTP
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);

  // OTP input has placeholder="••••••" and inputMode="numeric"
  await page.locator('input[inputmode="numeric"]').fill('123456');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  console.log('✅ Logged in - current url:', page.url());
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    // Login page
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await shot(page, '01_login');
    
    // Login
    await login(page);
    await shot(page, '02_dashboard_admin');

    // Leads page
    await page.goto('http://localhost:5173/leads', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '03_leads_list');

    // Click first lead
    const firstLead = page.locator('tbody tr.clickable').first();
    if (await firstLead.count() > 0) {
      await firstLead.click();
      await page.waitForTimeout(1500);
      await shot(page, '04_lead_detail');

      // Click Log Call
      const logCallBtn = page.locator('button:has-text("Log call"), button:has-text("Log Call")').first();
      if (await logCallBtn.count() > 0) {
        await logCallBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, '05_call_modal');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Clients page
    await page.goto('http://localhost:5173/clients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '06_clients_list');

    // Click first client if exists
    const firstClient = page.locator('tbody tr.clickable').first();
    if (await firstClient.count() > 0) {
      await firstClient.click();
      await page.waitForTimeout(1500);
      await shot(page, '07_client_detail');
    }

    // HR My Dashboard
    await page.goto('http://localhost:5173/my/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '08_my_dashboard');

    // HR My Leave
    await page.goto('http://localhost:5173/my/leave', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '09_my_leave');

    // HR My Documents
    await page.goto('http://localhost:5173/my/documents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '10_my_documents');

    // HR Admin pages
    await page.goto('http://localhost:5173/hr/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '11_hr_dashboard');

    await page.goto('http://localhost:5173/hr/employees', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '12_hr_employees');

    await page.goto('http://localhost:5173/hr/leaves', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '13_hr_leaves');

    // Split & Settings
    await page.goto('http://localhost:5173/split', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '14_split_settings');

    // Mobile view - leads
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/leads', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '15_mobile_leads');

    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await shot(page, '16_mobile_dashboard');

    console.log('\n✅ All screenshots done! Check: ' + OUT_DIR);

  } catch (err) {
    console.error('❌ Error:', err.message);
    await shot(page, 'error_state');
  }

  await browser.close();
})();
