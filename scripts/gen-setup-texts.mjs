// توليد نصوص معالج الربط (كود الجداول وكود الدرايف) من الملفات الأصلية — قبل البناء
import { readFileSync, writeFileSync } from 'fs';

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const schema = readFileSync('supabase/schema.sql', 'utf8');
const script = readFileSync('drive-backup/AppsScript.gs', 'utf8');

writeFileSync(
  'lib/setupTexts.js',
  '// ملف مولّد تلقائياً من supabase/schema.sql و drive-backup/AppsScript.gs — متعدلوش يدوي\n' +
    'export const SCHEMA_SQL = `' + esc(schema) + '`;\n' +
    'export const DRIVE_SCRIPT = `' + esc(script) + '`;\n'
);
console.log('✓ lib/setupTexts.js generated');
