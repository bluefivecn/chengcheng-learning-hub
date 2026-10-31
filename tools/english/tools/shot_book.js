// 截图检查：首页 / 单词宝库（各单元）
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const url = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(root, '..', 'shots', 'book3-home.png'), fullPage: false });

  // 打开单词宝库
  await page.evaluate(() => { renderBook(); go('book'); });
  await page.waitForTimeout(500);
  const chips = await page.$$eval('.book-filter .chip', els => els.map(e => e.textContent.trim()));
  console.log('chips:', chips.join(' | '));
  await page.screenshot({ path: path.join(root, '..', 'shots', 'book3-words.png'), fullPage: false });

  // 各单元词汇数量
  const secs = await page.$$eval('.book-section', els => els.map(e => {
    const h = e.querySelector('h3');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  }));
  console.log('sections:', secs.join(' || '));

  // 句子区
  const groups = await page.$$eval('.sent-group h4', els => els.map(e => e.textContent.trim()));
  console.log('sent units:', groups.join(' | '));
  await page.evaluate(() => { const g = document.querySelectorAll('.sent-group')[0]; if (g) g.scrollIntoView(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, '..', 'shots', 'book3-sent.png') });

  // 手机宽度
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(url, { waitUntil: 'networkidle' });
  await m.evaluate(() => { renderBook(); go('book'); });
  await m.waitForTimeout(500);
  await m.screenshot({ path: path.join(root, '..', 'shots', 'book3-mobile.png'), fullPage: false });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors ✔');
  await browser.close();
})();
