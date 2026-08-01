#!/usr/bin/env node
/**
 * Mobile regression audit.
 *
 * Checks the running stack for the classes of defect the P0/P1/P2 passes fixed,
 * so they can't quietly come back:
 *   1. horizontal overflow at phone widths
 *   2. touch targets below 44px (measuring the .touch-target ::after box)
 *   3. overlapping hit areas — catches .touch-target applied to a dense cluster
 *   4. form fields under 16px (iOS zoom-lock)
 *   5. landscape breakage
 *   6. the shell painting during hydration rather than a dead screen
 *   7. a visible focus ring
 *
 * Usage:  node apps/frontend/scripts/mobile-audit.mjs [baseUrl]
 * Exits non-zero on any regression.
 *
 * Playwright is deliberately NOT a dependency of this package — it is a heavy
 * browser download and this harness is run by hand, not in the app build. Get
 * it with `npx playwright@latest install chromium`, or set PLAYWRIGHT_PATH to
 * an existing install.
 */
const { chromium } = await (async () => {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    'playwright-core',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return await import(c);
    } catch { /* try the next candidate */ }
  }
  console.error(
    'mobile-audit: playwright not found.\n' +
    'Install it with:  npx playwright@latest install chromium\n' +
    'or point PLAYWRIGHT_PATH at an existing playwright module.',
  );
  process.exit(2);
})();

const BASE = process.argv[2] ?? 'http://127.0.0.1:3200';
const USER = process.env.AUDIT_USER ?? 'demo';
const PASS = process.env.AUDIT_PASS ?? 'demo1234';
const WIDTHS = [320, 360, 390, 430];

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok   ${msg}`);

/**
 * Documented exceptions to the 44px floor. Each needs a reason — an exception
 * without one is a bug being hidden.
 */
const TARGET_EXCEPTIONS = [
  {
    match: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+/,
    why: 'week rail: seven 44px columns do not fit at 320px, and scrolling a week view is worse; 39x84 has ample area',
  },
];
const excused = (label) => TARGET_EXCEPTIONS.some((e) => e.match.test(label));

// Runs in the page. Returns the *effective* hit rect of every interactive
// element: for a .touch-target element that is its ::after box (>=44px, centred
// on the element), not the border box.
const HIT_RECTS = () => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], summary';
  const els = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.getAttribute('tabindex') === '-1') continue;
    if (el.disabled) continue;
    // Links flowing inline inside a paragraph are text, not touch targets.
    if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p')) continue;
    // A control wrapping a broken image collapses to its alt text, so its
    // measured size reflects a missing file rather than the layout.
    const imgs = [...el.querySelectorAll('img')];
    if (imgs.length && imgs.every((img) => img.naturalWidth === 0)) continue;
    // Deliberate overlays — the fixed bottom tab bar and topic action bar, and
    // absolutely-positioned badges like an attachment's remove button — sit on
    // top of content by design. Their own size is still checked; they are just
    // excluded from the collision test, which is looking for controls that
    // fight for the same tap in normal flow.
    let overlay = getComputedStyle(el).position === 'absolute';
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).position === 'fixed') { overlay = true; break; }
    }
    els.push({ el, r, overlay });
  }

  return els.map(({ el, r, overlay }, i) => {
    let w = r.width;
    let h = r.height;
    if (el.classList.contains('touch-target')) {
      const after = getComputedStyle(el, '::after');
      w = Math.max(w, parseFloat(after.minWidth) || 0);
      h = Math.max(h, parseFloat(after.minHeight) || 0);
    }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Indices of the other tracked controls this one contains or sits inside.
    // A row Link containing its own RowActions is nesting, not a tap collision.
    const related = [];
    els.forEach(({ el: other }, j) => {
      if (i !== j && (el.contains(other) || other.contains(el))) related.push(j);
    });
    return {
      i,
      related,
      overlay,
      label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
      w, h,
      left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2,
    };
  });
};

const browser = await chromium.launch();

// ---- log in once and reuse the session ----
const setup = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await setup.newPage();
await sp.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await sp.waitForFunction(() => document.querySelectorAll('input').length >= 2, null, { timeout: 30000 });
const inputs = await sp.$$('input');
await inputs[0].fill(USER);
await inputs[1].fill(PASS);
await sp.click('button[type="submit"]');
await sp.waitForURL(`${BASE}/`, { timeout: 30000 });
await sp.waitForTimeout(3500);
const storageState = await setup.storageState();
const session = await sp.evaluate(() => JSON.stringify(sessionStorage));
await setup.close();

const newCtx = async (viewport) => {
  const ctx = await browser.newContext({ storageState, viewport, hasTouch: true, isMobile: true });
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(JSON.parse(s))) sessionStorage.setItem(k, v);
  }, session);
  return ctx;
};

let ctx = await newCtx({ width: 390, height: 844 });
let page = await ctx.newPage();

// ---- discover the deep routes ----
const settle = async (url) => {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 20000 }).catch(() => {});
  // A button wrapping an unloaded <img> collapses to a few px and would be
  // reported as an undersized target. Wait for images before measuring.
  await page.waitForFunction(
    () => [...document.images].every((img) => img.complete),
    null,
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(600);
};

await settle('/');
const subjectHref = await page.evaluate(() => document.querySelector('a[href^="/subject/"]')?.getAttribute('href') ?? null);
let chapterHref = null;
let topicHref = null;
if (subjectHref) {
  await settle(subjectHref);
  chapterHref = await page.evaluate(() => document.querySelector('a[href^="/chapter/"]')?.getAttribute('href') ?? null);
}
if (chapterHref) {
  await settle(chapterHref);
  topicHref = await page.evaluate(() => document.querySelector('a[href^="/topic/"]')?.getAttribute('href') ?? null);
}
const ROUTES = ['/', '/insights', '/calendar', '/bookmarks', '/archive', '/settings', '/coaching',
  subjectHref, chapterHref, topicHref].filter(Boolean);

console.log(`\nmobile audit — ${BASE}`);
console.log(`routes: ${ROUTES.length}\n`);

// ---- 1. horizontal overflow ----
console.log('1. horizontal overflow, 320-430px');
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const route of ROUTES) {
    await settle(route);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) fail(`overflow: ${route} @${w}px by ${over}px`);
  }
}
if (!failures.length) ok('no route overflows at any phone width');

// ---- 2 & 3. touch targets and hit-box overlap ----
console.log('2. touch targets >= 44px, and 3. no overlapping hit areas');
await page.setViewportSize({ width: 390, height: 844 });
for (const route of ROUTES) {
  await settle(route);
  const rects = await page.evaluate(HIT_RECTS);

  const small = rects.filter((r) => (r.w < 44 || r.h < 44) && !excused(r.label));
  if (small.length) {
    const shown = [...new Set(small.map((r) => `${r.label} ${Math.round(r.w)}x${Math.round(r.h)}`))].slice(0, 6);
    fail(`touch target: ${route} has ${small.length} under 44px — ${shown.join(', ')}`);
  }

  const overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.related.includes(b.i)) continue;   // nested, not colliding
      if (a.overlay || b.overlay) continue;    // deliberately layered
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) {
        overlaps.push(`${a.label} <-> ${b.label}`);
      }
    }
  }
  if (overlaps.length) {
    fail(`hit overlap: ${route} — ${[...new Set(overlaps)].slice(0, 5).join(' | ')}`);
  }
}

// ---- 4. iOS zoom-lock ----
console.log('4. form fields >= 16px');
for (const route of ['/', '/settings', ...(topicHref ? [topicHref] : [])]) {
  await settle(route);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (!el.getBoundingClientRect().width) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.push(`${el.tagName.toLowerCase()} ${fs}px`);
    }
    return out;
  });
  if (bad.length) fail(`ios zoom: ${route} — ${[...new Set(bad)].join(', ')}`);
}

// ---- 5. landscape ----
console.log('5. landscape 844x390');
await ctx.close();
ctx = await newCtx({ width: 844, height: 390 });
page = await ctx.newPage();
for (const route of ROUTES.slice(0, 5)) {
  await settle(route);
  const m = await page.evaluate(() => ({
    over: document.documentElement.scrollWidth - window.innerWidth,
    sidebar: !!document.querySelector('aside')?.getBoundingClientRect().height,
    tabbar: !!document.querySelector('nav[aria-label="Primary"]')?.getBoundingClientRect().height,
  }));
  if (m.over > 0) fail(`landscape: ${route} overflows by ${m.over}px`);
  if (m.sidebar && m.tabbar) fail(`landscape: ${route} shows both sidebar and tab bar`);
}

// ---- 6. the shell paints during hydration ----
console.log('6. shell paints during hydration (3G + 4x CPU)');
await ctx.close();
ctx = await newCtx({ width: 390, height: 844 });
page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 400, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// What matters is the *ordering*: the shell must be interactive while the data
// region is still pending. An absolute millisecond budget would really be
// measuring bundle download and would swing with cache warmth, so it is
// reported for information only rather than asserted.
for (const route of ['/', chapterHref, subjectHref].filter(Boolean)) {
  const t0 = Date.now();
  await page.goto(BASE + route);
  let headerAt = null;
  let shellBeforeData = false;
  let saw404 = false;
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => ({
      header: !!document.querySelector('header')?.getBoundingClientRect().height,
      skeleton: !!document.querySelector('.skeleton'),
      notFound: /This page could not be found/.test(document.body.innerText),
      done: !document.querySelector('.skeleton') && document.body.innerText.trim().length > 300,
    }));
    if (s.header && headerAt === null) headerAt = Date.now() - t0;
    // The state this whole restructure exists to produce: chrome up, data pending.
    if (s.header && s.skeleton) shellBeforeData = true;
    if (s.notFound) saw404 = true;
    if (s.done) break;
    await page.waitForTimeout(100);
  }
  // A deep route must never 404 just because the store hasn't loaded yet.
  if (saw404) fail(`hydration: ${route} rendered a 404 while loading`);
  if (headerAt === null) fail(`hydration: ${route} never painted a header`);
  if (!shellBeforeData) fail(`hydration: ${route} never showed chrome while data was pending — the shell is being withheld again`);
  console.log(`       ${route} header@${headerAt}ms, shell-before-data=${shellBeforeData}`);
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// ---- 7. focus ring ----
console.log('7. focus ring present');
await settle('/');
const noRing = await page.evaluate(() => {
  const out = [];
  // Disabled controls can't take focus, so .focus() is a no-op on them and the
  // computed style is simply the unfocused one — not a missing ring.
  const els = [...document.querySelectorAll('button, a[href]')]
    .filter((e) => e.getBoundingClientRect().height > 0 && !e.disabled)
    .slice(0, 14);
  for (const el of els) {
    el.focus();
    const cs = getComputedStyle(el);
    const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (!hasOutline && !hasShadow) out.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24));
  }
  return out;
});
if (noRing.length) fail(`focus ring: ${[...new Set(noRing)].slice(0, 6).join(', ')} show none`);

await browser.close();

console.log('');
if (failures.length) {
  console.error(`mobile audit FAILED — ${failures.length} regression(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('mobile audit: all checks passed');
