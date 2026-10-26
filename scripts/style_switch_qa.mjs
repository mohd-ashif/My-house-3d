// Exterior-design switcher checks. Run with the browser-automation runner:
//   MODE=desktop|phone-low node <browser-automation>/browser.mjs about:blank --script scripts/style_switch_qa.mjs
const BASE = process.env.BASE || 'http://localhost:3143';
const OUT = 'screenshots/styles';
const main = (p, fn) => p.evaluate(fn, undefined, undefined, false); // page main world (patchright isolates by default)

const fpsFor = (p, ms) => p.evaluate((ms) => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(+(n / (ms / 1000)).toFixed(1)); }; requestAnimationFrame(f); }), ms);

export default async function run(page) {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  return (process.env.MODE || 'desktop') === 'desktop' ? desktop(page) : phone(page);
}

async function desktop(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let i = 0; i < 30; i++) { try { await page.goto(BASE + '/?style=modern-tropical'); break; } catch { await page.waitForTimeout(1000); } }
  await page.getByRole('button', { name: 'Enter the house' }).waitFor({ timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('.intro button[disabled]'), null, { timeout: 180000 });
  await page.waitForTimeout(4000); // intro thumbnails render offscreen
  await page.screenshot({ path: `${OUT}/ui_intro_choose_elevation.png` });
  const introThumbs = await page.locator('.intro .design-card img').count();
  await page.getByRole('button', { name: 'Enter the house' }).click();
  await page.waitForTimeout(800);
  await main(page, () => document.exitPointerLock?.());
  // V cycles designs; outside, the camera flies to the hero shot
  const toasts = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(600);
    if (i === 0) await page.screenshot({ path: `${OUT}/ui_switch_mid_transition.png` });
    toasts.push(await page.locator('.toast').innerText().catch(() => ''));
    await page.waitForTimeout(2400);
  }
  const url = await main(page, () => location.search);
  const saved = await main(page, () => localStorage.getItem('house-style'));
  // Design panel: pick Kerala by its card
  await page.getByRole('button', { name: 'Exterior design (V)' }).click();
  await page.locator('.design-panel').waitFor();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/ui_desktop_design_panel.png` });
  const panelThumbs = await page.locator('.design-panel .design-card img').count();
  await page.locator('.design-panel').getByRole('radio', { name: /Kerala Tile Gable/ }).click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${OUT}/ui_after_switch_kerala.png` });
  const checked = await page.locator('.design-panel [aria-checked="true"] .d-name').innerText();
  return { introThumbs, toasts, url, saved, panelThumbs, checked, errors: errors.slice(0, 5) };
}

async function phone(page) {
  const ctx = await page.context().browser().newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(BASE + '/?tier=low&style=modern-tropical');
  await p.getByRole('button', { name: 'Explore freely' }).waitFor({ timeout: 240000 });
  await p.waitForFunction(() => !document.querySelector('.intro button[disabled]'), null, { timeout: 240000 });
  await p.getByRole('button', { name: 'Explore freely' }).click();
  await p.getByRole('button', { name: 'Skip the tutorial' }).click({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(14000); // the other designs' geometry is pre-built in the background first
  const tier = await p.evaluate(() => document.querySelector('.root')?.dataset.tier);
  const idleFps = await fpsFor(p, 3000);
  const results = [];
  for (const name of ['Contemporary Gable', 'Kerala Tile Gable', 'Modern Tropical']) {
    await p.getByRole('button', { name: 'Open the menu' }).click();
    await p.locator('.sheet').waitFor();
    await p.waitForTimeout(1500);
    if (name === 'Contemporary Gable') await p.screenshot({ path: `${OUT}/ui_phone_sheet_design.png` });
    await p.locator('.sheet').getByRole('radio', { name: new RegExp(name) }).click();
    const fps = await fpsFor(p, 3000); // measured across the 1.2 s switch and after it
    const steadyFps = await fpsFor(p, 3000); // the next 3 s, in the new design
    const lost = await main(p, () => { const c = document.querySelector('canvas'); const gl = c?.getContext('webgl2') || c?.getContext('webgl'); return gl ? gl.isContextLost() : 'no gl'; });
    results.push({ name, fpsDuringSwitch: fps, steadyFps, contextLost: lost, fatal: await p.locator('.fatal').count() });
  }
  await p.screenshot({ path: `${OUT}/ui_phone_after_switches.png` });
  await ctx.close();
  return { tier, idleFps, results, errors: errors.slice(0, 5) };
}
