/* Optional browser QA. Set PLAYWRIGHT_MODULE to an installed playwright package,
 * or install playwright in this repository's Node resolution path.
 * Usage: node scripts/browser_smoke.cjs http://127.0.0.1:4173/service/?mode=mock
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const target = process.argv[2] || 'http://127.0.0.1:4173/service/?mode=mock';
const output = path.resolve(process.env.QA_OUTPUT_DIR || '.artifacts/browser');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '지역 관측 지도' }).waitFor();
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 427);
    assert.match(await page.locator('.disclaimer').innerText(), /시연용 합성 데이터/);

    const search = page.getByRole('textbox', { name: '자치구 또는 행정동 검색' });
    await search.fill('성산');
    assert.equal(await page.locator('.district-item').count(), 2);
    await page.locator('.district-item').first().click();
    assert.match(await page.locator('.detail-heading h2').innerText(), /성산/);
    await page.getByRole('button', { name: '검색어 지우기' }).click();

    const results = [];
    for (const scenario of ['normal', 'risk_spike', 'missing_data', 'expired_policy', 'no_policy']) {
      await page.locator('#scenario').selectOption(scenario);
      await page.locator('.run-button').click();
      await page.waitForFunction(() => !document.querySelector('.run-button').disabled, { timeout: 20000 });
      assert.equal(await page.locator('.error').count(), 0);
      const summary = await page.locator('.run-summary').innerText();
      const policies = await page.locator('.policy-card').count();
      if (scenario === 'missing_data') {
        assert.match(await page.locator('.detail-heading .badge').innerText(), /자료부족/);
        assert.equal(policies, 0);
        assert.match(await page.locator('.district-item.selected .district-number').innerText(), /—/);
        assert.match(summary, /자료 보완/);
      } else if (scenario === 'no_policy') {
        assert.equal(policies, 0);
        assert.match(await page.locator('.no-policy').innerText(), /담당자 확인/);
      } else {
        assert(policies > 0 && policies <= 3);
      }
      if (scenario === 'expired_policy') assert.match(await page.locator('.timeline').innerText(), /재검색/);
      results.push({ scenario, summary, policy_count: policies });
    }

    await search.fill('존재하지않는동999');
    assert.equal(await page.locator('.district-item').count(), 0);
    await page.getByRole('button', { name: '전체 지역 보기' }).click();
    assert.equal(await page.locator('.district-item').count(), 427);
    await page.getByRole('combobox', { name: '관측 상태 필터' }).selectOption('high');
    assert((await page.locator('.district-item').count()) > 0);
    const badges = await page.locator('.district-item .badge').allTextContents();
    assert(badges.every(value => value === '위험'));
    await page.getByRole('combobox', { name: '관측 상태 필터' }).selectOption('all');
    await page.locator('#scenario').selectOption('risk_spike');
    await page.locator('.run-button').click();
    await page.waitForFunction(() => !document.querySelector('.run-button').disabled);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'Mobile page overflows horizontally');
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await page.getByRole('tab', { name: '지역 현황' }).click();
    assert(await page.locator('.score-row').isVisible());
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    const report = { target, checked_at: new Date().toISOString(), district_count: 427, scenarios: results, mobile_horizontal_overflow: overflow, page_errors: errors };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
