// نسخ worker بتاع pdf.js لمجلد public — بيتنفذ تلقائياً قبل البناء والتشغيل
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
mkdirSync('public', { recursive: true });
copyFileSync(src, 'public/pdf.worker.min.mjs');
console.log('✓ pdf.worker.min.mjs copied to public/');
