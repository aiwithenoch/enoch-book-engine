/* ============================================================================
   visual-check.mjs - structural checks for the screenshots an agent must inspect
   ----------------------------------------------------------------------------
   This is not a replacement for eyes. It checks the things a browser can prove
   before the agent opens the PNGs: screenshots exist, SVG text has explicit
   colours, labels stay inside the viewBox and cards in a row share alignment.
   Logo assets are also checked against their contain frame.
   It then lists every block screenshot, with diagram pages called out.

   Usage:
     node engine/tools/visual-check.mjs <book.html> [--ack-visual]

   The first run exits 2 after generating the report. Open every listed PNG and
   inspect alignment, spacing, clipping, and meaning. Run again with
   --ack-visual only after that visual review.
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const input = process.argv[2];
if (!input || input.startsWith('--')) {
  console.error('Usage: node engine/tools/visual-check.mjs <book.html> [--ack-visual]');
  process.exit(1);
}

const abs = path.resolve(input);
const outdir = path.resolve(process.argv.includes('--out-dir')
  ? process.argv[process.argv.indexOf('--out-dir') + 1]
  : path.dirname(abs));
const reportPath = path.resolve(process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : path.join(outdir, 'visual-qa.json'));
const acknowledged = process.argv.includes('--ack-visual');

if (!fs.existsSync(abs)) {
  console.error(`No generated book at ${input}`);
  process.exit(1);
}

fs.mkdirSync(outdir, { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const browser = await chromium.launch();
let exitCode = 0;
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(abs).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const viewport = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    if (!sheet) return null;
    const rect = sheet.getBoundingClientRect();
    return { width: Math.ceil(rect.width) + 40, height: Math.ceil(rect.height) + 40 };
  });
  if (!viewport) {
    console.error('No .sheet found in ' + input);
    exitCode = 1;
  } else {
    await page.setViewportSize(viewport);

    const rows = await page.evaluate(() => {
      const titleOf = (sheet) =>
        (sheet.querySelector('.title')?.textContent || sheet.className.replace('sheet', '').trim() || 'untitled')
          .trim()
          .slice(0, 80);
      const number = (value) => Number.isFinite(value) ? Number(value.toFixed(2)) : null;
      const boxOf = (element) => {
        try {
          const box = element.getBBox();
          return { x: number(box.x), y: number(box.y), width: number(box.width), height: number(box.height) };
        } catch {
          return null;
        }
      };
      const inside = (box, width, height, pad = 1) =>
        box && box.x >= -pad && box.y >= -pad &&
        box.x + box.width <= width + pad && box.y + box.height <= height + pad;
      const styleHas = (element, property) => {
        const attr = element.getAttribute(property);
        const style = element.getAttribute('style') || '';
        return Boolean(attr?.trim()) || new RegExp(`(?:^|;)\\s*${property}\\s*:`, 'i').test(style);
      };

      return [...document.querySelectorAll('.sheet')].map((sheet, index) => {
        const isBlock = sheet.classList.contains('bb');
        const svg = sheet.querySelector('.diagram svg');
        const logo = sheet.querySelector('.logo');
        const base = { page: index + 1, title: titleOf(sheet), block: isBlock, diagram: Boolean(svg), logo: Boolean(logo), issues: [] };
        const issues = [];

        if (logo) {
          const logoRect = logo.getBoundingClientRect();
          const assets = [...logo.querySelectorAll('img,svg')];
          if (!assets.length) issues.push('logo frame has no img or svg asset');
          for (const asset of assets) {
            if (asset.tagName.toLowerCase() === 'img' && (!asset.complete || asset.naturalWidth === 0)) {
              issues.push(`logo image failed to load: ${asset.getAttribute('src') || '(inline)'}`);
            }
            const assetRect = asset.getBoundingClientRect();
            if (assetRect.left < logoRect.left - 1 || assetRect.right > logoRect.right + 1 ||
                assetRect.top < logoRect.top - 1 || assetRect.bottom > logoRect.bottom + 1) {
              issues.push('logo asset escapes its contain frame');
            }
          }
        }

        if (!svg) return { ...base, issues };

        const viewBox = svg.viewBox.baseVal;
        const width = viewBox.width;
        const height = viewBox.height;
        const texts = [...svg.querySelectorAll('text')].map((element, textIndex) => ({
          index: textIndex + 1,
          text: (element.textContent || '').trim().slice(0, 80),
          box: boxOf(element),
          explicitFill: styleHas(element, 'fill'),
        }));
        const drawable = [...svg.querySelectorAll('rect,circle,line,polyline,polygon,text')]
          .map((element) => ({ tag: element.tagName.toLowerCase(), box: boxOf(element) }))
          .filter((entry) => entry.box);
        const cards = [...svg.querySelectorAll('rect')]
          .map((element) => ({
            x: Number(element.getAttribute('x') || 0),
            y: Number(element.getAttribute('y') || 0),
            width: Number(element.getAttribute('width') || 0),
            height: Number(element.getAttribute('height') || 0),
          }))
          .filter((card) => card.width >= 100 && card.height >= 40);

        const outOfBounds = drawable.filter((entry) => !inside(entry.box, width, height, 1));
        if (outOfBounds.length) {
          issues.push(`drawable elements outside the ${width}×${height} viewBox (${outOfBounds.length})`);
        }

        const missingFill = texts.filter((entry) => !entry.explicitFill);
        if (missingFill.length) {
          issues.push(`SVG text without explicit fill (${missingFill.length})`);
        }

        const cardTextIssues = [];
        for (const entry of texts) {
          if (!entry.box) continue;
          const cx = entry.box.x + entry.box.width / 2;
          const cy = entry.box.y + entry.box.height / 2;
          const card = cards.find((candidate) =>
            cx >= candidate.x && cx <= candidate.x + candidate.width &&
            cy >= candidate.y && cy <= candidate.y + candidate.height);
          if (!card) continue;
          const fits = entry.box.x >= card.x + 5 &&
            entry.box.y >= card.y + 3 &&
            entry.box.x + entry.box.width <= card.x + card.width - 5 &&
            entry.box.y + entry.box.height <= card.y + card.height - 3;
          if (!fits) cardTextIssues.push(entry.text || `text ${entry.index}`);
        }
        if (cardTextIssues.length) {
          issues.push(`card labels touch or exceed card bounds: ${cardTextIssues.join(', ')}`);
        }

        const groups = [];
        for (const card of cards) {
          const group = groups.find((candidate) => Math.abs(candidate.y - card.y) <= 3);
          if (group) group.cards.push(card);
          else groups.push({ y: card.y, cards: [card] });
        }
        const cardRowIssues = [];
        for (const group of groups) {
          if (group.cards.length < 2) continue;
          const ys = group.cards.map((card) => card.y);
          const heights = group.cards.map((card) => card.height);
          if (Math.max(...ys) - Math.min(...ys) > 2) cardRowIssues.push(`row ${group.y} has misaligned card tops`);
          if (Math.max(...heights) - Math.min(...heights) > 2) cardRowIssues.push(`row ${group.y} has uneven card heights`);
        }
        if (cardRowIssues.length) issues.push(...cardRowIssues);

        const svgRect = svg.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const frameIssues = [];
        if (svgRect.left < sheetRect.left - 1 || svgRect.right > sheetRect.right + 1) frameIssues.push('diagram exceeds page width');
        if (svgRect.top < sheetRect.top - 1 || svgRect.bottom > sheetRect.bottom + 1) frameIssues.push('diagram exceeds page height');
        if (frameIssues.length) issues.push(...frameIssues);

        return {
          ...base,
          issues,
          viewBox: `${width}×${height}`,
          cardCount: cards.length,
          textCount: texts.length,
        };
      });
    });

    const pages = rows.map((row) => ({
      ...row,
      screenshot: path.join(outdir, `page${row.page}.png`),
      screenshotExists: fs.existsSync(path.join(outdir, `page${row.page}.png`)),
    }));
    const missingScreenshots = pages.filter((row) => !row.screenshotExists);
    if (missingScreenshots.length) {
      for (const row of missingScreenshots) row.issues.push('screenshot missing');
    }

    const report = {
      tool: 'enoch-book-engine visual-check',
      book: abs,
      generatedAt: new Date().toISOString(),
      acknowledged,
      pages,
      diagramPages: pages.filter((row) => row.diagram && row.block).map((row) => ({ page: row.page, title: row.title, screenshot: row.screenshot })),
      logoPages: pages.filter((row) => row.logo && row.block).map((row) => ({ page: row.page, title: row.title, screenshot: row.screenshot })),
      reviewPages: pages.filter((row) => row.block).map((row) => ({ page: row.page, title: row.title, diagram: row.diagram, logo: row.logo, screenshot: row.screenshot })),
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

    const structuralIssues = pages.flatMap((row) => row.issues.map((issue) => `page ${row.page} ${row.title}: ${issue}`));
    console.table(pages.map((row) => ({
      page: row.page,
      title: row.title,
      kind: row.block ? ['block', row.diagram ? 'diagram' : null, row.logo ? 'logo' : null].filter(Boolean).join(' + ') : 'generated',
      screenshot: row.screenshotExists ? 'yes' : 'NO',
      issues: row.issues.length,
    })));
    console.log(`visual report: ${reportPath}`);
    console.log(`diagram pages: ${report.diagramPages.length}`);
    console.log(`logo pages: ${report.logoPages.length}`);
    if (structuralIssues.length) {
      console.error('\nVISUAL STRUCTURE FAILED:');
      for (const issue of structuralIssues) console.error(`- ${issue}`);
      exitCode = 1;
    } else if (!acknowledged) {
      console.log('\nVISUAL REVIEW REQUIRED. Open every block screenshot below.');
      for (const row of report.reviewPages) {
        const markers = [row.diagram ? '[DIAGRAM]' : '', row.logo ? '[LOGO]' : ''].filter(Boolean).join(' ');
        console.log(`- page ${row.page}${markers ? ` ${markers}` : ''}: ${row.title} -> ${row.screenshot}`);
      }
      console.log('\nInspect alignment, card spacing, label clipping, image crops, logo containment, and whether each diagram says the right thing. Then rerun with --ack-visual.');
      exitCode = 2;
    } else {
      console.log('\nVisual structure checks passed and visual review acknowledged ✓');
    }
  }
} finally {
  await browser.close();
}

process.exitCode = exitCode;
