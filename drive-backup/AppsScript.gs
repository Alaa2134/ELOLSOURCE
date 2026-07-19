// سكريبت النسخ الاحتياطي اليومي لنظام كاشير السقا على جوجل درايف
// بيستقبل النسخة من البرنامج ويحفظها في مجلد SaqqaPOS-Backups
// وبيحتفظ بآخر 7 نسخ فقط — عشان المساحة متزيدش في الفاضي
//
// خطوات التفعيل (مرة واحدة — بحساب جوجل بتاع العميل):
// 1. افتح script.google.com واعمل New project
// 2. امسح الكود الموجود والصق الكود ده واحفظ
// 3. Deploy -> New deployment -> النوع Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. انسخ رابط الـ Web app وحطه في البرنامج: لوحة الأدمن -> نسخ احتياطي يومي

function doPost(e) {
  var folderName = 'SaqqaPOS-Backups';
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);

  var name = 'saqqa-backup-' + Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd') + '.json';

  // تجميع كل الملفات الموجودة
  var files = folder.getFiles();
  var all = [];
  while (files.hasNext()) all.push(files.next());

  // حذف نسخة اليوم لو موجودة (استبدال مش تكرار)
  all.forEach(function (f) {
    if (f.getName() === name) f.setTrashed(true);
  });

  // الإبقاء على أحدث 6 نسخ قديمة فقط (+ نسخة النهارده = 7)
  all
    .filter(function (f) { return f.getName() !== name; })
    .sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); })
    .slice(6)
    .forEach(function (f) { f.setTrashed(true); });

  folder.createFile(name, e.postData.contents, 'application/json');
  return ContentService.createTextOutput('ok');
}
