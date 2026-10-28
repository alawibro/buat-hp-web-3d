#!/usr/bin/env node
/* ==========================================================
   tests/audit.js
   Audit otomatis: responsif (HP portrait/landscape, tablet, laptop),
   CLS, kontras teks, target sentuh, fokus keyboard, nama aksesibel,
   mode "kurangi gerakan", dan jalur error stage 3D.

   Cara jalankan (dari folder proyek):
     npm install
     npx playwright install chromium
     npm run audit            # CDN di-mock dengan file lokal (offline)
     npm run audit -- --live  # memakai CDN asli (unpkg, gstatic)

   Hasil: audit-report/REPORT.md, audit-report/report.json,
          audit-report/screens/*.png
   Exit code 1 jika ada pelanggaran "wajib" (lihat bagian FAIL).
   ========================================================== */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'audit-report');
const LIVE = process.argv.includes('--live');
const TABS = ['beranda', 'sekolah', 'hobi', 'anime', 'game', 'bini', 'funfact', 'diet', 'kuliah', 'pkl', 'kontak', 'pesan'];
const VIEWPORTS = [
  { name: 'hp-360x740', width: 360, height: 740, mobile: true },
  { name: 'hp-390x844', width: 390, height: 844, mobile: true },
  { name: 'hp-landscape-844x390', width: 844, height: 390, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: false },
  { name: 'laptop-1366x768', width: 1366, height: 768, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, mobile: false },
];

const results = { mode: LIVE ? 'live-cdn' : 'offline-mock', fail: [], warn: [], info: {}, viewports: {} };
const fail = (where, msg) => results.fail.push(`${where}: ${msg}`);
const warn = (where, msg) => results.warn.push(`${where}: ${msg}`);

/* ---------- Server statis untuk folder proyek ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ---------- Mock CDN untuk mode offline ---------- */
async function routeCdn(ctx) {
  if (LIVE) return;
  // Entry utama paket (main), karena package.json tidak selalu diekspor
  const mv = require.resolve('@google/model-viewer');
  const threeRoot = path.resolve(path.dirname(require.resolve('three')), '..');
  const draco = path.join(threeRoot, 'examples/jsm/libs/draco/gltf');
  await ctx.route('https://unpkg.com/@google/model-viewer@3/dist/model-viewer.min.js', (r) => r.fulfill({ path: mv, contentType: 'application/javascript' }));
  await ctx.route(/^https:\/\/www\.gstatic\.com\/draco\/versioned\/decoders\/1\.5\.6\/(.+)$/, (r, req) => {
    const f = req.url().split('/1.5.6/')[1];
    r.fulfill({ path: path.join(draco, f), contentType: f.endsWith('.wasm') ? 'application/wasm' : 'application/javascript' });
  });
  await ctx.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (r) => r.abort());
}

/* ---------- Pemeriksaan di dalam halaman (self-contained) ---------- */
const inPage = () => {
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };

  // Kumpulkan lapisan latar dari teks ke atas sampai ketemu latar solid atau gradien
  const backdrop = (el) => {
    const layers = [];
    let base = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        const stops = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean);
        const opaque = stops.filter((s) => s.a >= 1);
        if (opaque.length) { base = opaque; break; }
        if (stops.length) {
          // Gradien semi-transparan: pakai rata-ratanya sebagai lapisan, lalu cari latar di bawahnya
          const n = stops.length;
          layers.push({
            r: stops.reduce((s, c) => s + c.r, 0) / n,
            g: stops.reduce((s, c) => s + c.g, 0) / n,
            b: stops.reduce((s, c) => s + c.b, 0) / n,
            a: stops.reduce((s, c) => s + c.a, 0) / n,
          });
        }
        continue;
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a >= 1) { base = [c]; break; }
      if (c && c.a > 0) layers.push(c);
    }
    if (!base || base.length === 0) base = [{ r: 255, g: 255, b: 255, a: 1 }];
    // Komposit lapisan semi-transparan (paling jauh dulu)
    return base.map((b) => layers.slice().reverse().reduce((acc, l) => over(l, acc), b));
  };

  const textEls = Array.from(document.querySelectorAll('body *')).filter((el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && visible(el) && !el.closest('script, style'));

  const lowContrast = [];
  let checked = 0, skippedGradientText = 0;
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color);
    if (!fg0 || fg0.a === 0) { skippedGradientText++; continue; }
    if (!/[A-Za-z0-9\u00C0-\u024F]/.test(el.textContent)) continue; // emoji/simbol saja
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    let worst = Infinity;
    for (const bg of backdrop(el)) {
      const fg = over(fg0, bg);
      worst = Math.min(worst, ratio(fg, bg));
    }
    checked++;
    if (worst < need) lowContrast.push({ text: el.textContent.trim().slice(0, 40), ratio: +worst.toFixed(2), need, size: Math.round(size), cls: String(el.className).slice(0, 40) });
  }

  // Ukuran teks kecil (< 12px)
  const smallText = textEls.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
    .map((el) => el.textContent.trim().slice(0, 30));

  // Elemen konten yang keluar dari viewport (bukan latar dekoratif)
  const vw = window.innerWidth;
  const overflow = Array.from(document.querySelectorAll('main *, .site-nav *, footer *'))
    .filter((el) => visible(el))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
    .map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0]);

  // Target sentuh (tombol, tautan, tab) yang lebih kecil dari 44×44 CSS px
  const interactive = Array.from(document.querySelectorAll('button, a[href], [role="tab"], input, select, textarea'))
    .filter(visible)
    .map((el) => { const r = el.getBoundingClientRect(); return { label: (el.textContent || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; });
  const smallTargets = interactive.filter((t) => t.w < 44 || t.h < 44);

  return { lowContrast, checked, skippedGradientText, smallText, overflow, interactive: interactive.length, smallTargets };
};

/* ---------- Main ---------- */
(async () => {
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });

  for (const vp of VIEWPORTS) {
    const key = vp.name;
    results.viewports[key] = { tabs: {}, cls: null, stage: null };
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    await routeCdn(ctx);
    await ctx.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) consoleErrors.push('console: ' + m.text().slice(0, 160)); });

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    // Stage bisa berada di bawah lipatan (lazy load di HP): gulir dulu agar model dimuat
    await page.evaluate(() => document.querySelector('.soda-stage').scrollIntoView({ block: 'center' }));
    const stageState = await page.waitForSelector('.soda-stage.is-ready, .soda-stage.is-error', { timeout: 60000 })
      .then((h) => h.evaluate((el) => (el.classList.contains('is-ready') ? 'ready' : 'error')))
      .catch(() => 'timeout');
    results.viewports[key].stage = stageState;
    await page.waitForTimeout(5000); // ukur CLS setelah halaman stabil
    results.viewports[key].cls = await page.evaluate(() => +window.__cls.toFixed(4));
    if (results.viewports[key].cls > 0.1) fail(key, `CLS ${results.viewports[key].cls} > 0.1`);
    else if (results.viewports[key].cls > 0) warn(key, `CLS ${results.viewports[key].cls} (di atas 0)`);
    if (stageState !== 'ready') warn(key, `stage 3D tidak siap (status: ${stageState})`);

    for (const tab of TABS) {
      await page.click(`#tab-${tab}`);
      await page.waitForTimeout(350);
      // Upaya geser horizontal: halaman tidak boleh bergeser ke samping
      await page.evaluate(() => window.scrollTo(400, 0));
      const scrollX = await page.evaluate(() => window.scrollX);
      await page.evaluate(() => window.scrollTo(0, 0));
      const r = await page.evaluate(inPage);
      results.viewports[key].tabs[tab] = { scrollX, ...r, lowContrast: r.lowContrast.length, smallTargets: r.smallTargets.length };
      if (scrollX > 0) fail(`${key}/${tab}`, `halaman bisa digeser horizontal (scrollX=${scrollX})`);
      if (r.overflow.length) fail(`${key}/${tab}`, `elemen keluar viewport: ${r.overflow.slice(0, 3).join(', ')}`);
      if (r.lowContrast.length) fail(`${key}/${tab}`, `kontras rendah ${r.lowContrast.length}: ${JSON.stringify(r.lowContrast.slice(0, 3))}`);
      if (r.smallText.length) warn(`${key}/${tab}`, `teks < 12px: ${r.smallText.slice(0, 3).join(' | ')}`);
      if (vp.mobile && r.smallTargets.length) warn(`${key}/${tab}`, `${r.smallTargets.length} target sentuh < 44px (contoh: ${r.smallTargets.slice(0, 2).map((t) => `${t.label} ${t.w}×${t.h}`).join(', ')})`);
      if (tab === 'beranda') await page.screenshot({ path: path.join(OUT, 'screens', `${key}-beranda.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (consoleErrors.length) fail(key, 'error JS: ' + consoleErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ---------- Pemeriksaan global (satu kali, viewport laptop) ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await routeCdn(ctx);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Struktur dasar aksesibilitas
    const a11y = await page.evaluate(() => {
      const named = (el) => (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || (el.querySelector('img') || {}).alt;
      const unnamed = Array.from(document.querySelectorAll('button, a[href]')).filter((el) => !named(el)).map((el) => el.outerHTML.slice(0, 80));
      const imgNoAlt = Array.from(document.querySelectorAll('img')).filter((i) => !i.hasAttribute('alt')).map((i) => i.src);
      const mvNoAlt = Array.from(document.querySelectorAll('model-viewer')).filter((m) => !m.getAttribute('alt')).length;
      const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
      const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
      return { lang: document.documentElement.lang, unnamed, imgNoAlt, mvNoAlt, dupIds: [...new Set(dupIds)] };
    });
    results.info.a11y = a11y;
    if (a11y.lang !== 'id') fail('global', `atribut lang = "${a11y.lang}", seharusnya "id"`);
    if (a11y.unnamed.length) fail('global', `${a11y.unnamed.length} tombol/tautan tanpa nama: ${a11y.unnamed.slice(0, 2).join(' | ')}`);
    if (a11y.imgNoAlt.length) fail('global', `gambar tanpa alt: ${a11y.imgNoAlt.length}`);
    if (a11y.mvNoAlt) fail('global', `model-viewer tanpa alt: ${a11y.mvNoAlt}`);
    if (a11y.dupIds.length) fail('global', `id ganda: ${a11y.dupIds.join(', ')}`);

    // Fokus keyboard: setiap elemen yang difokus harus punya outline terlihat
    await page.focus('#tab-beranda');
    const focusReport = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        // model-viewer: sorotan ada di bingkai stage (.soda-stage:focus-within)
        const target = el.tagName === 'MODEL-VIEWER' ? el.closest('.soda-stage').querySelector('.soda-stage__frame') : el;
        const tcs = getComputedStyle(target);
        return { tag: el.tagName.toLowerCase(), label: (el.textContent || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 24), outline: tcs.outlineStyle + ' ' + tcs.outlineWidth };
      });
      focusReport.push(f);
    }
    // body: penanda saat fokus keluar dokumen, bukan elemen interaktif
    const invisible = focusReport.filter((f) => f.tag !== 'body' && (/^none/.test(f.outline) || /^0px/.test(f.outline.split(' ')[1] || '')));
    results.info.focus = { checked: focusReport.length, invisible: invisible.length, sample: focusReport.slice(0, 4) };
    if (invisible.length) fail('global', `fokus tidak terlihat pada ${invisible.length} elemen: ${invisible.map((f) => f.tag + ' ' + f.label).join(', ')}`);

    // Navigasi tab dengan panah keyboard
    await page.focus('#tab-beranda');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const arrowSelected = await page.evaluate(() => document.querySelector('.tab-btn[aria-selected="true"]').dataset.page);
    results.info.arrowNav = arrowSelected;
    if (arrowSelected !== 'sekolah') fail('global', `panah kanan tidak pindah tab (terpilih: ${arrowSelected})`);

    // Tombol ke atas, badge kunjungan, dan toast tampil di layar
    const chrome = await page.evaluate(() => ['.to-top', '.visit-badge'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { s, inside: r.right <= innerWidth && r.bottom <= innerHeight }; }));
    if (chrome.some((c) => !c.inside)) fail('global', 'elemen melayang keluar viewport');
    await ctx.close();
  }

  // Mode "kurangi gerakan"
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await routeCdn(ctx);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const rm = await page.evaluate(() => ({
      bubblesHidden: getComputedStyle(document.querySelector('.soda-bubbles')).display === 'none',
      autoRotate: document.querySelector('.soda-stage__model').hasAttribute('auto-rotate'),
      pageAnimDur: getComputedStyle(document.querySelector('.page')).animationDuration,
    }));
    results.info.reducedMotion = rm;
    if (!rm.bubblesHidden) fail('reduced-motion', 'gelembung masih tampil');
    if (rm.autoRotate) fail('reduced-motion', 'auto-rotate masih aktif');
    await ctx.close();
  }

  // Jalur error stage 3D (GLB tidak ditemukan)
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await routeCdn(ctx);
    // Kedua sumber model dibuat gagal: data base64 dan file .glb
    await ctx.route('**/bintang-1.js', (r) => r.fulfill({ status: 404, body: 'nf' }));
    await ctx.route('**/bintang-1.glb', (r) => r.fulfill({ status: 404, body: 'nf' }));
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const errorShown = await page.waitForSelector('.soda-stage.is-error', { timeout: 60000 }).then(() => true).catch(() => false);
    const navOk = await page.click('#tab-hobi').then(() => true).catch(() => false);
    results.info.stageError = { errorShown, pageStillUsable: navOk };
    if (!errorShown) fail('stage-error', 'status error tidak muncul saat GLB 404');
    if (!navOk) fail('stage-error', 'halaman tidak bisa dipakai saat stage error');
    await ctx.close();
  }

  await browser.close();
  srv.close();

  /* ---------- Laporan ---------- */
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  const lines = [];
  lines.push('# Laporan audit', '', `Mode: **${results.mode}** · Dibuat: ${new Date().toISOString()}`, '');
  lines.push('| Viewport | Stage 3D | CLS | Tab diperiksa | Kontras gagal | Keluar viewport | Target < 44px |', '|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(results.viewports)) {
    const tabs = Object.values(v.tabs);
    lines.push(`| ${k} | ${v.stage} | ${v.cls} | ${tabs.length} | ${tabs.reduce((a, t) => a + t.lowContrast, 0)} | ${tabs.reduce((a, t) => a + t.overflow.length, 0)} | ${tabs.reduce((a, t) => a + t.smallTargets, 0)} |`);
  }
  lines.push('', `## FAIL (${results.fail.length})`, ...(results.fail.length ? results.fail.map((x) => '- ' + x) : ['- tidak ada']));
  lines.push('', `## WARN (${results.warn.length})`, ...(results.warn.length ? results.warn.map((x) => '- ' + x) : ['- tidak ada']));
  lines.push('', '## Info', '```json', JSON.stringify(results.info, null, 2), '```');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), lines.join('\n'));

  console.log(lines.slice(0, 12).join('\n'));
  console.log(`\nFAIL: ${results.fail.length} · WARN: ${results.warn.length} · laporan: audit-report/REPORT.md`);
  process.exit(results.fail.length ? 1 : 0);
})().catch((e) => { console.error('AUDIT ERROR', e); process.exit(2); });
