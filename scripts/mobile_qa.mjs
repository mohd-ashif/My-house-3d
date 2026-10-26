// Mobile acceptance tests. Run with the browser-automation runner, one device per run:
//   DEVICE=iphone13 node <browser-automation>/browser.mjs about:blank --script scripts/mobile_qa.mjs
// DEVICE: iphone13 | iphone13-land | pixel7 | s20-low | ipad | desktop.   BASE (default http://localhost:3130)
// Real multi-touch goes through CDP Input.dispatchTouchEvent; notch / home-bar insets are simulated
// by overriding the --sa* variables (Chromium does not emulate env(safe-area-inset-*)).
const BASE = process.env.BASE || 'http://localhost:3130';
const OUT = process.env.OUT || 'screenshots/mobile';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DEVICES = {
  'iphone13': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS, insets: { t: 47, r: 0, b: 34, l: 0 } },
  'iphone13-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS, insets: { t: 0, r: 47, b: 21, l: 47 } },
  'pixel7': { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: AND, insets: { t: 0, r: 0, b: 0, l: 0 } },
  's20-low': { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: AND.replace('Pixel 7', 'SM-G980F'), insets: { t: 0, r: 0, b: 0, l: 0 }, cpu: 4 },
  'ipad': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'), insets: { t: 20, r: 0, b: 20, l: 0 } },
};

export default async function run(page) {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  const name = process.env.DEVICE || 'iphone13';
  if (name === 'desktop') return desktop(page);
  const dev = DEVICES[name];
  const ctx = await page.context().browser().newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: dev.userAgent });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  if (dev.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
  const { width: W, height: H } = dev.viewport;
  const ins = dev.insets;
  const shot = (s) => p.screenshot({ path: `${OUT}/${name}_${s}.png` });
  const wait = (ms) => p.waitForTimeout(ms);
  const pl = () => p.evaluate(() => { const q = window.__house.player; return { x: q.x, z: q.z, yaw: q.yaw, feet: q.feet, zoom: q.camZoom, auto: !!q.auto }; }, undefined, undefined, false); // main world (patchright isolates by default)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const res = { device: name, checks: {} };

  await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.addStyleTag({ content: `.is-touch{--sat:${ins.t}px!important;--sar:${ins.r}px!important;--sab:${ins.b}px!important;--sal:${ins.l}px!important}` });
  const tourBtn = p.getByRole('button', { name: 'Start the guided tour' });
  await tourBtn.waitFor({ timeout: 180000 });
  await p.waitForFunction(() => !document.querySelector('.intro button[disabled]'), null, { timeout: 180000 });
  await wait(600);
  res.tier = await p.evaluate(() => document.querySelector('canvas') ? 'ok' : 'no canvas');
  await shot('1_intro');

  // explore freely -> first-visit onboarding
  await p.getByRole('button', { name: 'Explore freely' }).click();
  await p.locator('.onboard').waitFor({ timeout: 10000 });
  await wait(700);
  await shot('2_onboarding');
  await p.getByRole('button', { name: 'Skip the tutorial' }).click();
  await wait(500);

  // ---- multi-touch: left thumb walks, right thumb looks, at the same time ----
  const a = await pl();
  const jx = W * 0.2, jy = H * 0.72, lx = W * 0.72, ly = H * 0.5;
  await touch('touchStart', [[jx, jy, 1]]);
  await touch('touchStart', [[jx, jy, 1], [lx, ly, 2]]);
  for (let i = 1; i <= 20; i++) {
    await touch('touchMove', [[jx, jy - Math.min(60, i * 6), 1], [lx + i * 6, ly, 2]]);
    await wait(60);
  }
  await shot('3_walking_multitouch');
  for (let i = 0; i < 10; i++) { await touch('touchMove', [[jx, jy - 60, 1], [lx + 120, ly, 2]]); await wait(80); }
  await touch('touchEnd', []);
  await wait(300);
  const b = await pl();
  res.checks.multitouch = { moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), turned: +Math.abs(b.yaw - a.yaw).toFixed(2) };
  res.checks.multitouch.ok = res.checks.multitouch.moved > 0.3 && res.checks.multitouch.turned > 0.2;

  // ---- run: joystick held at the edge for > 1 s ----
  await touch('touchStart', [[jx, jy, 3]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[jx, jy - i * 20, 3]]); await wait(40); }
  await wait(1400);
  res.checks.run = await p.evaluate(() => window.__house.player.run, undefined, undefined, false);
  res.checks.runBadge = await p.locator('.run-badge').isVisible();
  await shot('4_running');
  await touch('touchEnd', []);
  await wait(300);

  // ---- tap-to-walk: quick tap on the floor (right side) ----
  // known open spot: the living room, facing the back wall, camera tilted down at the floor
  await p.evaluate(() => { const q = window.__house.player; q.x = 10.6; q.z = 7.2; q.feet = 0.45; q.eye = 2.07; q.yaw = 0; q.pitch = -0.35; q.auto = null; }, undefined, undefined, false);
  await wait(400);
  const c = await pl();
  await touch('touchStart', [[W * 0.62, H * 0.78, 4]]); await wait(60); await touch('touchEnd', []);
  await wait(450);
  const walking = await pl();
  await wait(2500);
  const d = await pl();
  res.checks.tapToWalk = { started: walking.auto, moved: +Math.hypot(d.x - c.x, d.z - c.z).toFixed(2) };
  res.checks.tapToWalk.ok = res.checks.tapToWalk.moved > 0.3;

  // ---- pinch zoom on the right side ----
  const z0 = (await pl()).zoom;
  await touch('touchStart', [[W * 0.7, H * 0.45, 5]]);
  await touch('touchStart', [[W * 0.7, H * 0.45, 5], [W * 0.8, H * 0.55, 6]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[W * 0.7 - i * 6, H * 0.45 - i * 6, 5], [W * 0.8 + i * 6, H * 0.55 + i * 6, 6]]); await wait(40); }
  await touch('touchEnd', []);
  await wait(200);
  const z1 = (await pl()).zoom;
  res.checks.pinch = { before: +z0.toFixed(2), after: +z1.toFixed(2), ok: z1 < z0 - 0.3 };

  // ---- double-tap the right side: 1st person ----
  const dbl = async () => { for (const id of [7, 8]) { await touch('touchStart', [[W * 0.75, H * 0.35, id]]); await wait(40); await touch('touchEnd', []); await wait(90); } await wait(400); };
  await dbl();
  const firstPerson = await p.locator('.crosshair').isVisible();
  await shot('5_first_person');
  await dbl();
  res.checks.doubleTap = { firstPerson, backToThird: !(await p.locator('.crosshair').isVisible()) };
  res.checks.doubleTap.ok = res.checks.doubleTap.firstPerson && res.checks.doubleTap.backToThird;

  // ---- menu sheet -> teleport ----
  await p.getByRole('button', { name: 'Open the menu' }).click();
  await p.locator('.sheet').waitFor();
  await wait(400);
  await shot('6_menu_sheet');
  res.layout = await layoutCheck(p, ins, '.sheet-body'); // the sheet's glass runs under the home bar by design; its content must not
  await p.getByRole('button', { name: 'Go to Master Bedroom, First Floor' }).click();
  await wait(900);
  res.checks.sheetTeleport = { pill: (await p.locator('.m-pill b').innerText()), ok: (await p.locator('.m-pill b').innerText()) === 'Master Bedroom' };

  // ---- radar -> full floor plan -> tap a room ----
  await p.getByRole('button', { name: 'Open the floor plan' }).click();
  await p.locator('.plan-overlay').waitFor();
  await p.getByRole('tab', { name: /GF/ }).click();
  await wait(300);
  await shot('7_floor_plan');
  await p.locator('[aria-label="Go to Kitchen"]').first().click();
  await wait(900);
  res.checks.planTeleport = { pill: await p.locator('.m-pill b').innerText() };
  res.checks.planTeleport.ok = res.checks.planTeleport.pill === 'Kitchen';

  // ---- HUD while walking: safe areas, overlaps, sizes ----
  res.hud = await layoutCheck(p, ins, null);
  await shot('8_hud');

  // ---- guided tour caption ----
  await p.getByRole('button', { name: 'Open the menu' }).click();
  await p.getByRole('button', { name: 'Guided tour: Restart' }).click();
  await p.locator('.tour-size').waitFor({ timeout: 60000 });
  await wait(500);
  await shot('9_tour_caption');
  res.tour = await layoutCheck(p, ins, '.tour-card');
  res.checks.tourCaption = { title: await p.locator('.tour-card h2').innerText(), size: await p.locator('.tour-size').innerText() };
  await p.getByRole('button', { name: 'Next stop' }).click();
  await wait(300);
  res.checks.tourNext = await p.locator('.tour-meta').innerText();
  await p.getByRole('button', { name: 'Pause the tour' }).click();
  res.checks.tourPaused = await p.getByRole('button', { name: 'Resume the tour' }).isVisible();
  await p.getByRole('button', { name: 'Exit the tour' }).click();

  // ---- fps while idle in the scene, layout shift, a11y names ----
  res.fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)); }; requestAnimationFrame(f); }));
  res.cls = await p.evaluate(() => +window.__cls.toFixed(4), undefined, undefined, false);
  res.unnamedButtons = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  res.tierUsed = await p.evaluate(() => ({ tier: document.querySelector('.root')?.dataset.tier, dpr: window.devicePixelRatio, canvasPx: document.querySelector('canvas')?.width }));
  res.errors = errors.slice(0, 5);
  await ctx.close();
  return res;
}

/** Every visible HUD element must sit inside the safe area, not overlap another, be >= 44 px tappable, and text >= 12 px. */
async function layoutCheck(p, ins, extra) {
  return p.evaluate(({ ins, extra }) => {
    const W = innerWidth, H = innerHeight;
    const sel = ['.m-top .radar', '.m-top .m-pill', '.m-top .m-actions', '.rotate-hint', '.tour-card'];
    if (extra) sel.push(extra);
    const els = [...new Set(sel.flatMap((s) => [...document.querySelectorAll(s)]))].filter((e) => e.getBoundingClientRect().width > 0);
    const out = { outsideSafe: [], overlaps: [], smallTargets: [], smallText: [] };
    const r = els.map((e) => ({ e, b: e.getBoundingClientRect(), n: e.className.baseVal ?? e.className }));
    for (const { b, n } of r) {
      if (b.left < ins.l - 0.5 || b.top < ins.t - 0.5 || b.right > W - ins.r + 0.5 || b.bottom > H - ins.b + 0.5) out.outsideSafe.push(`${n} [${b.left|0},${b.top|0},${b.right|0},${b.bottom|0}]`);
    }
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const A = r[i].b, B = r[j].b;
      if (r[i].e.contains(r[j].e) || r[j].e.contains(r[i].e)) continue;
      if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1) out.overlaps.push(`${r[i].n} x ${r[j].n}`);
    }
    for (const b of document.querySelectorAll('.m-top button, .sheet button, .tour-card button, .plan-overlay button, .rotate-hint button, .onboard button')) {
      const q = b.getBoundingClientRect();
      if (q.width && (q.width < 43.5 || q.height < 43.5)) out.smallTargets.push(`${b.getAttribute('aria-label') || b.textContent.trim()} ${q.width|0}x${q.height|0}`);
    }
    const walker = document.createTreeWalker(document.querySelector('.root'), NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!t.textContent.trim() || !el || el.closest('svg') || el.closest('.intro') || !el.getClientRects().length) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) out.smallText.push(`${t.textContent.trim().slice(0, 20)} ${fs}px`);
    }
    // the joystick zone (left 40 %, lower half) must stay free of HUD buttons
    out.inJoystickZone = r.filter(({ b, n }) => !/tour-card|sheet/.test(n) && b.left < W * 0.4 && b.bottom > H * 0.5).map(({ n }) => n);
    return out;
  }, { ins, extra });
}

/** Desktop regression: WASD, C / N keys, the original HUD. */
async function desktop(page) {
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto(BASE + '/');
  const enter = page.getByRole('button', { name: 'Enter the house' });
  await enter.waitFor({ timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('.intro button[disabled]'), null, { timeout: 180000 });
  await enter.click();
  await page.waitForTimeout(800);
  const pl = () => page.evaluate(() => { const q = window.__house.player; return { x: q.x, z: q.z, yaw: q.yaw }; }, undefined, undefined, false);
  const a = await pl();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const b = await pl();
  await page.keyboard.press('KeyC'); await page.waitForTimeout(300);
  const crosshair = await page.locator('.crosshair').isVisible();
  await page.keyboard.press('KeyN'); await page.waitForTimeout(300);
  const nightBtn = await page.getByRole('button', { name: /Day \(N\)/ }).isVisible();
  const hud = { select: await page.locator('.controls select').isVisible(), minimap: await page.locator('.minimap').isVisible(), hint: await page.locator('.hint').innerText(), mobileHud: await page.locator('.m-top').count() };
  await page.screenshot({ path: `${OUT}/desktop_hud.png` });
  await page.keyboard.press('KeyN'); await page.keyboard.press('KeyC');
  await page.evaluate(() => document.exitPointerLock?.(), undefined, undefined, false); // users press Esc first
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('button', { name: 'Start the guided tour' }).click();
  await page.locator('.tour-size').waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${OUT}/desktop_tour.png` });
  return { walkedW: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), cKey1stPerson: crosshair, nKeyNight: nightBtn, hud };
}
