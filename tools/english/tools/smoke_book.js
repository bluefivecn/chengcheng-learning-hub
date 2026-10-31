// 四个游戏 + 单词宝库冒烟测试
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
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, '..', 'shots', 'book3-home2.png') });

  for (const fn of ['startMemory', 'startQuiz', 'startListen', 'startOdd']) {
    await page.evaluate(f => window[f](), fn);
    await page.waitForTimeout(700);
    const cards = await page.$$eval('.screen.active .mcard, .screen.active .quiz-opt, .screen.active .listen-tile, .screen.active .odd-tile', els => els.length);
    console.log(fn, '→ tiles:', cards);
    await page.evaluate(() => go('home'));
    await page.waitForTimeout(250);
  }

  // 单词宝库点一个单词，确认有音频地址
  await page.evaluate(() => { renderBook(); go('book'); });
  await page.waitForTimeout(400);
  const src = await page.evaluate(() => {
    const el = document.querySelector('[data-say]');
    el.click();
    return null;
  });
  await page.waitForTimeout(800);
  const playing = await page.evaluate(() => !!(window.AUDIO_MANIFEST && Object.keys(window.AUDIO_MANIFEST.clips).length));
  console.log('manifest clips:', playing);

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors ✔');
  await browser.close();
})();
