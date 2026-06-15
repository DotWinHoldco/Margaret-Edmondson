// Read page count + per-page size (inches, from PDF points) for the raw scanner PDFs.
// Usage: node scripts/pdf-pageinfo.mjs <pdf> [<pdf> ...]
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';

for (const p of process.argv.slice(2)) {
  try {
    const bytes = fs.readFileSync(p);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    const pages = doc.getPages();
    console.log(`\n=== ${p}  (${(bytes.length/1e6).toFixed(1)} MB, ${pages.length} page(s)) ===`);
    pages.forEach((pg, i) => {
      const { width, height } = pg.getSize(); // PDF points (72pt = 1in)
      const win = (width / 72), hin = (height / 72);
      const ar = (Math.max(win, hin) / Math.min(win, hin)).toFixed(3);
      console.log(`  p${i + 1}: ${win.toFixed(2)} x ${hin.toFixed(2)} in  (${width.toFixed(0)}x${height.toFixed(0)} pt)  AR=${ar} ${win > hin ? 'landscape' : 'portrait'}`);
    });
  } catch (e) {
    console.log(`\n=== ${p} === ERROR: ${e.message}`);
  }
}
