// بيكتب رقم نسخة البناء في public/version.txt — البرنامج بيفحصه دورياً
// وبيحدّث نفسه تلقائياً لما تنزل نسخة جديدة (من غير ما المستخدم يعمل حاجة)
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../public/version.txt', import.meta.url), String(Date.now()));
console.log('version.txt generated');
