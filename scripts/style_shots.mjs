// Screenshots of every exterior design from its hero camera + a right-side corner view.
//   node <browser-automation>/browser.mjs about:blank --script scripts/style_shots.mjs   (BASE, default http://localhost:3140)
const BASE = process.env.BASE || 'http://localhost:3140';
const OUT = 'screenshots/styles';
const STYLES = {
  'modern-tropical': '20.0,3.2,23.5,7.6,3.6,6.5',
  'concrete-gable': '5.2,2.6,23.5,9.2,4.6,6.2',
  'kerala-tile': '10.6,1.9,26.5,9.0,4.6,6.0',
  'teak-gable': '9.44,1.9,17.8,9.6,5.2,6.0',
  'teak-gable-garden': '18.6,1.9,17.4,7.8,4.2,5.5',
};
const CORNER = '24.5,4.2,17.0,10.5,3.8,4.0';
export default async function run(page) {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (let i = 0; i < 30; i++) { try { await page.goto(BASE + '/'); break; } catch { await page.waitForTimeout(1000); } }
  const done = [];
  for (const [id, hero] of Object.entries(STYLES)) {
    for (const [name, view] of [['hero', hero], ['right_corner', CORNER]]) {
      await page.goto(`${BASE}/?style=${id}&view=${view}`);
      await page.waitForSelector('canvas', { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('.loader'), null, { timeout: 180000 });
      await page.waitForTimeout(2600); // lighting crossfade + façade rise
      await page.screenshot({ path: `${OUT}/${id}_${name}.png` });
      done.push(`${id}_${name}`);
    }
  }
  return { done, errors: errors.slice(0, 8) };
}
