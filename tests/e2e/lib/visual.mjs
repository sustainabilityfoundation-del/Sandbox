// Numeric screenshot comparison for e2e flows, so agents report numbers instead of reading images into context.
// No dependency: the page's own canvas decodes both PNGs and counts differing pixels.
//
//   import { compareToBaseline } from '../lib/visual.mjs'
//   const r = await compareToBaseline(page, 'cad-pattern', { maxDiffRatio: 0.002 })
//   // r = { name, status: 'pass' | 'fail' | 'baseline-written', diffRatio, diffPixels, width, height, baseline, current, diff }
//
// Baselines live in tests/e2e/baselines/<name>.png (committed once the owner approves them) and are written on first run or when
// UPDATE_BASELINES=1. Failing runs save the current image and a diff image under the scratch folder `shotsDir` (never committed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const baselineDir = path.resolve(here, '..', 'baselines');

const diffInPage = async (page, baselineB64, currentB64, perChannelTolerance) =>
  page.evaluate(
    async ({ a, b, tol }) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('cannot decode image'));
          img.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true, a: [ia.width, ia.height], b: [ib.width, ib.height] };
      const w = ia.width;
      const h = ia.height;
      const px = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h);
      };
      const da = px(ia);
      const db = px(ib);
      const out = new ImageData(w, h);
      let diff = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
        if (d > tol) {
          diff++;
          out.data.set([255, 0, 0, 255], i);
        } else out.data.set([da.data[i], da.data[i + 1], da.data[i + 2], 60], i);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').putImageData(out, 0, 0);
      return { width: w, height: h, diff, diffPng: c.toDataURL('image/png').split(',')[1] };
    },
    { a: baselineB64, b: currentB64, tol: perChannelTolerance }
  );

export async function compareToBaseline(page, name, { maxDiffRatio = 0.002, perChannelTolerance = 8, shotsDir = path.join(process.env.TEMP ?? '/tmp', 'e2e-visual'), clip, fullPage = false } = {}) {
  const current = await page.screenshot({ fullPage, clip });
  const baseline = path.join(baselineDir, `${name}.png`);
  if (!fs.existsSync(baseline) || process.env.UPDATE_BASELINES === '1') {
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(baseline, current);
    return { name, status: 'baseline-written', baseline };
  }
  // Decode in a blank page of the same browser so the page under test is untouched.
  const scratchContext = await page.context().browser().newContext();
  const scratch = await scratchContext.newPage();
  try {
    const r = await diffInPage(scratch, fs.readFileSync(baseline).toString('base64'), current.toString('base64'), perChannelTolerance);
    if (r.sizeMismatch) return { name, status: 'fail', reason: `size ${r.a.join('x')} vs ${r.b.join('x')}`, baseline };
    const diffRatio = r.diff / (r.width * r.height);
    const status = diffRatio <= maxDiffRatio ? 'pass' : 'fail';
    const result = { name, status, diffRatio: Number(diffRatio.toFixed(5)), diffPixels: r.diff, width: r.width, height: r.height, baseline };
    if (status === 'fail') {
      fs.mkdirSync(shotsDir, { recursive: true });
      result.current = path.join(shotsDir, `${name}.current.png`);
      result.diff = path.join(shotsDir, `${name}.diff.png`);
      fs.writeFileSync(result.current, current);
      fs.writeFileSync(result.diff, Buffer.from(r.diffPng, 'base64'));
    }
    return result;
  } finally {
    await scratchContext.close();
  }
}
