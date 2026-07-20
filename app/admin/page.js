'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  getSettings,
  saveSettings,
  listInvoices,
  runDailyBackup,
  cloudLinkHash,
  getCloudConfig,
  setCloudConfig,
  syncPull,
  pushAllToCloud,
  cloudEnabled,
} from '@/lib/db';
import { SCHEMA_SQL, DRIVE_SCRIPT } from '@/lib/setupTexts';
import { num, todayISO } from '@/lib/format';
import InvoiceDoc from '@/components/InvoiceDoc';

// فاتورة تجريبية للمعاينة الحية في تخصيص الشكل
const DEMO_INVOICE = {
  number: 9082,
  date: todayISO(),
  payment: 'نقدي',
  customer: { name: 'أحمد محمود', number: 1, address: 'شبين الكوم' },
  items: [
    { code: '41', name: 'طبق فاكهه حفر سيتي مربع', qty: 2, price: 255, total: 510, notes: '' },
    { code: '11', name: 'زباله راتان وطنيه رقم 1', qty: 5, price: 94, total: 470, notes: '' },
    { code: '3840', name: 'طشت سالي شفاف بالرسم 31 خورشيد', qty: 1, price: 38.35, total: 38.35, notes: '' },
  ],
  totals: { subtotal: 1018.35, discount: 0, net: 1018.35, paid: 1018.35, remaining: 0 },
};

// ضغط اللوجو المرفوع لحجم مناسب
function resizeLogo(file, maxSize = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const INV_TOGGLES = [
  ['showLogo', 'إظهار اللوجو'],
  ['showQr', 'إظهار QR الفاتورة'],
  ['showTime', 'إظهار الوقت'],
  ['showCustomerNo', 'سطر رقم العميل'],
  ['showAddressRow', 'سطر العنوان'],
  ['colCode', 'عمود رقم الصنف'],
  ['colNotes', 'عمود الملاحظات'],
  ['showPageNo', 'ترقيم الصفحات'],
];

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={done ? 'btn-green' : 'btn-accent'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 3000);
        } catch {
          prompt('انسخ من هنا:', text);
        }
      }}
    >
      {done ? '✅ اتنسخ! روح الصقه' : label}
    </button>
  );
}

const PERMS = [
  { key: 'allowPriceEdit', label: 'الكاشير يقدر يعدل سعر الصنف في الفاتورة' },
  { key: 'allowDiscount', label: 'الكاشير يقدر يعمل خصومات' },
  { key: 'allowDeleteInvoice', label: 'الكاشير يقدر يحذف فواتير' },
  { key: 'cashierReports', label: 'الكاشير يشوف التقارير والمبيعات' },
  { key: 'cashierWhatsapp', label: 'الكاشير يدخل صفحة الواتساب' },
  { key: 'showStockInquiry', label: 'إظهار المخزون في صفحة استعلام الأسعار' },
];

export default function AdminPage() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState({ today: 0, month: 0, count: 0 });
  const [phoneQr, setPhoneQr] = useState('');
  // معالج الربط
  const [wizUrl, setWizUrl] = useState('');
  const [wizKey, setWizKey] = useState('');
  const [wizMsg, setWizMsg] = useState('');
  const [wizBusy, setWizBusy] = useState(false);

  async function connectCloud() {
    if (!wizUrl || !wizKey) { setWizMsg('⚠️ الصق الاتنين الأول'); return; }
    setWizBusy(true);
    setWizMsg('⏳ جاري الاختبار...');
    setCloudConfig(wizUrl, wizKey);
    const ok = await syncPull();
    if (!ok) {
      setWizMsg('❌ مش متوصل — راجع الخطوة 2 (كود الجداول) والصق الرابط والمفتاح تاني');
      setWizBusy(false);
      return;
    }
    setWizMsg('⏳ اتوصلنا! جاري رفع كل الأصناف والفواتير...');
    const push = await pushAllToCloud();
    setWizMsg(push.ok ? `🎉 تمام! اترفع ${push.count} سجل — كل حاجة بقت أونلاين ومتزامنة` : `⚠️ ${push.error || 'مشكلة في الرفع'}`);
    setWizBusy(false);
  }

  useEffect(() => {
    setS(getSettings());
    const invoices = listInvoices();
    const now = new Date();
    const today = invoices.filter((i) => new Date(i.date).toDateString() === now.toDateString());
    const month = invoices.filter((i) => {
      const d = new Date(i.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    setStats({
      today: today.reduce((x, i) => x + (i.totals?.net || 0), 0),
      month: month.reduce((x, i) => x + (i.totals?.net || 0), 0),
      count: invoices.length,
    });
    const st = getSettings();
    const conf = getCloudConfig();
    if (conf) { setWizUrl(conf.url); setWizKey(conf.key); }
    // الـ QR بيشيل إعداد السحابة معاه — الموبايل بيتظبط تلقائياً أول ما يمسحه
    const url = (st.publicBaseUrl || window.location.origin) + '/inquiry' + cloudLinkHash();
    QRCode.toDataURL(url, { margin: 1, width: 180 }).then(setPhoneQr).catch(() => {});
  }, []);

  if (!s) return null;
  const ar = s.arabicDigits;

  function save() {
    saveSettings(s);
    setMsg('✅ تم الحفظ');
    setTimeout(() => setMsg(''), 3000);
  }

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat orange">
          <div className="label">👑 مبيعات اليوم (أدمن فقط)</div>
          <div className="value">{num(stats.today, ar)}</div>
          <div className="sub">{s.currency}</div>
        </div>
        <div className="stat">
          <div className="label">مبيعات الشهر</div>
          <div className="value">{num(stats.month, ar)}</div>
          <div className="sub">{s.currency}</div>
        </div>
        <div className="stat green">
          <div className="label">إجمالي الفواتير</div>
          <div className="value">{num(stats.count, ar)}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>🔐 كلمات السر</h3>
          <div className="grid" style={{ gap: 10 }}>
            <label className="field">
              <span>كلمة سر الكاشير (الدخول العادي)</span>
              <input dir="ltr" value={s.pin} onChange={(e) => setS({ ...s, pin: e.target.value })} />
            </label>
            <label className="field">
              <span>كلمة سر الأدمن (بتفتح كل حاجة)</span>
              <input dir="ltr" value={s.adminPassword} onChange={(e) => setS({ ...s, adminPassword: e.target.value })} />
            </label>
            <label className="field">
              <span>كلمة سر المحاسب (شاشة مالية فقط: تقارير وكشوف وسندات)</span>
              <input dir="ltr" value={s.accountantPassword} onChange={(e) => setS({ ...s, accountantPassword: e.target.value })} />
            </label>
            <label className="field">
              <span>كلمة سر استعلام الأسعار من الموبايل</span>
              <input dir="ltr" value={s.inquiryPassword} onChange={(e) => setS({ ...s, inquiryPassword: e.target.value })} />
            </label>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            🔒 البرنامج بيقفل تلقائياً لو الجهاز دخل وضع السكون أو اتساب فترة، وبيطلب كلمة السر تاني.
          </p>
        </div>

        <div className="card">
          <h3>🎛️ صلاحيات الكاشير</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {PERMS.map((p) => (
              <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!s.perms[p.key]}
                  onChange={(e) => setS({ ...s, perms: { ...s.perms, [p.key]: e.target.checked } })}
                />
                {p.label}
              </label>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            💡 لوحة التحكم والتقارير والإعدادات ولوحة الأدمن للأدمن فقط — الكاشير بيشوف بس اللي مسموح له بيه.
          </p>
        </div>
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
        <h3>🪄 معالج الربط — 3 خطوات، افتح وانسخ والصق وبس</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          كل زرار بيفتحلك الصفحة الصح على المتصفح، وكل كود ليه زرار نسخ جاهز — مش محتاج تفهم أي حاجة تقنية.
        </p>

        <div className="wizard-step">
          <h4>1️⃣ المزامنة الأونلاين (مرة واحدة بس) {cloudEnabled() && <span className="badge green">✅ متفعلة</span>}</h4>
          <ol>
            <li>
              <a className="btn btn-primary btn-sm" href="https://supabase.com/dashboard/sign-up" target="_blank" rel="noreferrer">🌐 افتح موقع Supabase</a>
              &nbsp;← سجل دخول بزرار <b>GitHub</b> ← اضغط <b>New project</b> ← اكتب اسم <b>alsaka</b> وأي باسورد ← <b>Create</b> واستنى دقيقة
            </li>
            <li>
              من القايمة الشمال اختار <b>SQL Editor</b> ← اضغط هنا:&nbsp;
              <CopyBtn text={SCHEMA_SQL} label="📋 انسخ كود الجداول" />
              &nbsp;← الصقه في الصفحة واضغط <b>Run</b>
            </li>
            <li>
              من الترس تحت شمال <b>Project Settings ← API</b> ← انسخ <b>Project URL</b> و <b>anon public</b> والصقهم هنا:
              <div className="grid cols-2" style={{ margin: '8px 0', gap: 8 }}>
                <input dir="ltr" placeholder="https://xxxx.supabase.co" value={wizUrl} onChange={(e) => setWizUrl(e.target.value.trim())} />
                <input dir="ltr" placeholder="eyJhbGciOi..." value={wizKey} onChange={(e) => setWizKey(e.target.value.trim())} />
              </div>
              <button className="btn-green" disabled={wizBusy} onClick={connectCloud}>☁️ تفعيل ورفع كل البيانات</button>
              {wizMsg && <b style={{ marginRight: 10, fontSize: 13 }}>{wizMsg}</b>}
            </li>
          </ol>
        </div>

        <div className="wizard-step">
          <h4>2️⃣ نسخة احتياطية يومية على جوجل درايف {s.backupUrl && <span className="badge green">✅ متفعلة</span>}</h4>
          <ol>
            <li>
              <a className="btn btn-primary btn-sm" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">🌐 افتح Google Script</a>
              &nbsp;← سجل بحساب جوجل بتاعك — هيفتح مشروع جديد لوحده
            </li>
            <li>
              امسح الكود اللي في الصفحة و&nbsp;
              <CopyBtn text={DRIVE_SCRIPT} label="📋 انسخ كود الدرايف" />
              &nbsp;والصقه مكانه
            </li>
            <li>
              اضغط <b>Deploy</b> (فوق يمين) ← <b>New deployment</b> ← علامة الترس اختار <b>Web app</b> ←
              خلي <b>Who has access = Anyone</b> ← <b>Deploy</b> ← وافق على التصاريح ← انسخ الرابط اللي طلع والصقه هنا:
              <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                <input dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" value={s.backupUrl}
                  onChange={(e) => setS({ ...s, backupUrl: e.target.value.trim() })} />
                <button className="btn-green" onClick={async () => {
                  saveSettings({ backupUrl: s.backupUrl });
                  localStorage.removeItem('saqqa_last_backup');
                  await runDailyBackup();
                  setMsg('✅ اتبعتت نسخة تجريبية — بص على الدرايف هتلاقي مجلد SaqqaPOS-Backups');
                }} disabled={!s.backupUrl}>جرّب</button>
              </div>
            </li>
          </ol>
        </div>

        <div className="wizard-step">
          <h4>3️⃣ الواتساب (من برنامج الكاشير على الكمبيوتر)</h4>
          <ol>
            <li>افتح <b>برنامج كاشير السقا</b> المسطب على الكمبيوتر (البوابة شغالة جواه تلقائياً)</li>
            <li>من القايمة افتح صفحة <b>💬 واتساب</b> — هتلاقي مربع QR ظاهر</li>
            <li>من موبايل رقم المحل: واتساب ← الإعدادات ← <b>الأجهزة المرتبطة</b> ← <b>ربط جهاز</b> ← صوّر الـ QR — وخلاص، رسايل الشكر والتقارير هتتبعت لوحدها</li>
          </ol>
          <Link href="/whatsapp" className="btn btn-green btn-sm">💬 افتح صفحة الواتساب</Link>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>☁️ نسخ احتياطي يومي على جوجل درايف</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            بيتبعت نسخة تلقائياً <b>مرة واحدة يومياً</b> على درايف العميل، والسكريبت بيحتفظ بآخر
            <b> 7 نسخ فقط</b> — مساحة ثابتة مش بتزيد. خطوات التفعيل في README (مجلد drive-backup).
          </p>
          <label className="field" style={{ marginBottom: 10 }}>
            <span>رابط سكريبت الدرايف (Apps Script Web App URL)</span>
            <input dir="ltr" placeholder="https://script.google.com/macros/s/.../exec"
              value={s.backupUrl} onChange={(e) => setS({ ...s, backupUrl: e.target.value.trim() })} />
          </label>
          <button className="btn-green" onClick={async () => {
            saveSettings({ backupUrl: s.backupUrl });
            localStorage.removeItem('saqqa_last_backup');
            await runDailyBackup();
            setMsg('✅ تم إرسال نسخة احتياطية الآن');
          }} disabled={!s.backupUrl}>
            ☁️ إرسال نسخة الآن للتجربة
          </button>
        </div>

        <div className="card">
          <h3>📱 الدخول من التليفون</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            امسح الكود ده بكاميرا الموبايل (آيفون أو أندرويد) لفتح صفحة استعلام الأسعار — وتقدر تضيفها
            للشاشة الرئيسية كتطبيق.
          </p>
          {phoneQr && <img src={phoneQr} alt="QR" style={{ display: 'block', margin: '0 auto' }} />}
          <p style={{ textAlign: 'center', fontSize: 12 }} className="muted" dir="ltr">
            {(s.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')) + '/inquiry'}
          </p>
          <p style={{ marginTop: 10, fontSize: 13 }}>
            🛒 <b>كتالوج العملاء</b> (شاركه مع عملائك — يتفرجوا ويطلبوا واتساب):
          </p>
          <p style={{ fontSize: 12 }} className="muted" dir="ltr">
            {(s.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')) + '/catalog' + cloudLinkHash()}
          </p>
        </div>
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand)' }}>
        <h3>🧾 تخصيص شكل فاتورة البيع — والمعاينة بتتغير قدامك فوراً</h3>
        <div className="grid" style={{ gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {INV_TOGGLES.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }}
                  checked={s.invoice[key] !== false}
                  onChange={(e) => setS({ ...s, invoice: { ...s.invoice, [key]: e.target.checked } })} />
                {label}
              </label>
            ))}
            <label className="field"><span>حجم اللوجو</span>
              <select value={s.invoice.logoSize} onChange={(e) => setS({ ...s, invoice: { ...s.invoice, logoSize: e.target.value } })}>
                <option>صغير</option><option>وسط</option><option>كبير</option>
              </select></label>
            <label className="field"><span>حجم خط الجدول</span>
              <select value={s.invoice.fontSize} onChange={(e) => setS({ ...s, invoice: { ...s.invoice, fontSize: e.target.value } })}>
                <option>صغير</option><option>وسط</option><option>كبير</option>
              </select></label>
            <label className="field"><span>عدد الأصناف في الصفحة</span>
              <input type="number" min="8" max="35" value={s.invoice.rowsPerPage}
                onChange={(e) => setS({ ...s, invoice: { ...s.invoice, rowsPerPage: Number(e.target.value) || 22 } })} /></label>
            <label className="field"><span>شكل الأرقام في الفاتورة</span>
              <select value={s.arabicDigits ? 'عربي' : 'إنجليزي'}
                onChange={(e) => setS({ ...s, arabicDigits: e.target.value === 'عربي' })}>
                <option value="عربي">عربي (١٢٣)</option>
                <option value="إنجليزي">إنجليزي (123)</option>
              </select></label>
            <label className="field"><span>اسم الشركة</span>
              <input value={s.companyName} onChange={(e) => setS({ ...s, companyName: e.target.value })} /></label>
            <label className="field"><span>عنوان المستند</span>
              <input value={s.docTitle} onChange={(e) => setS({ ...s, docTitle: e.target.value })} /></label>
            <label className="field"><span>التليفونات (أسفل الفاتورة)</span>
              <input value={s.phones} onChange={(e) => setS({ ...s, phones: e.target.value })} /></label>
            <label className="field"><span>سطر أسفل الفاتورة (سياسة الاستبدال مثلاً)</span>
              <input value={s.invoice.footerText} placeholder="البضاعة تُستبدل خلال 14 يوم بالفاتورة"
                onChange={(e) => setS({ ...s, invoice: { ...s.invoice, footerText: e.target.value } })} /></label>

            <div className="field"><span style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>اللوجو</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                  📷 {s.logoImage ? 'تغيير اللوجو' : 'رفع لوجو جديد'}
                  <input type="file" accept="image/*" hidden onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try { setS({ ...s, logoImage: await resizeLogo(f) }); } catch { setMsg('❌ تعذر قراءة الصورة'); }
                  }} />
                </label>
                <img src={s.logoImage || '/logo.jpg'} alt="" className="thumb" />
                {s.logoImage && (
                  <button type="button" className="btn-sm btn-red" onClick={() => setS({ ...s, logoImage: '' })}>
                    رجّع لوجو ALSAKA
                  </button>
                )}
              </div>
            </div>

            <div className="field"><span style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
              خانات إضافية في بيانات الفاتورة (سيبها فاضية لو مش عايزها)</span>
              {[0, 1, 2].map((i) => {
                const cf = (s.invoice.customFields || [])[i] || { label: '', value: '' };
                const update = (patch) => {
                  const next = [...(s.invoice.customFields || [])];
                  while (next.length <= i) next.push({ label: '', value: '' });
                  next[i] = { ...next[i], ...patch };
                  setS({ ...s, invoice: { ...s.invoice, customFields: next } });
                };
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input placeholder={`اسم الخانة ${i + 1} (مثلاً: سجل تجاري)`} value={cf.label}
                      onChange={(e) => update({ label: e.target.value })} />
                    <input placeholder="قيمتها" value={cf.value}
                      onChange={(e) => update({ value: e.target.value })} />
                  </div>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>💡 متنساش تضغط "حفظ إعدادات الأدمن" تحت — وهيسري على كل الأجهزة</p>
          </div>
          <div className="inv-preview-wrap">
            <div className="inv-preview">
              <InvoiceDoc invoice={DEMO_INVOICE} settings={s} paper="a5" qrDataUrl={phoneQr || undefined} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>⚙️ تحكم سريع</h3>
        <div className="grid cols-4" style={{ alignItems: 'end' }}>
          <label className="field"><span>بداية ترقيم الفواتير</span>
            <input type="number" value={s.invoiceStart} onChange={(e) => setS({ ...s, invoiceStart: Number(e.target.value) || 1 })} /></label>
          <label className="field"><span>حد تنبيه المخزون</span>
            <input type="number" value={s.lowStock} onChange={(e) => setS({ ...s, lowStock: Number(e.target.value) || 0 })} /></label>
          <label className="field"><span>العملة</span>
            <input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.arabicDigits}
              onChange={(e) => setS({ ...s, arabicDigits: e.target.checked })} />
            أرقام عربية (١٢٣)
          </label>
          <label className="field"><span>ترتيب اقتراحات الأصناف في البيع</span>
            <select value={s.suggestSort || 'ذكي'} onChange={(e) => setS({ ...s, suggestSort: e.target.value })}>
              <option value="ذكي">ذكي (الأقرب لكلامك الأول)</option>
              <option value="أبجدي">أبجدي (أ ب ت...)</option>
              <option value="بالكود">برقم الصنف</option>
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <Link href="/settings" className="btn btn-primary">🏢 بيانات الشركة والنسخ الاحتياطي</Link>
          <Link href="/whatsapp" className="btn btn-green">💬 إعدادات الواتساب</Link>
          <Link href="/reports" className="btn">📈 التقارير الكاملة</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn-accent" onClick={save} style={{ fontSize: 16, padding: '10px 30px' }}>💾 حفظ إعدادات الأدمن</button>
        {msg && <b>{msg}</b>}
      </div>
    </div>
  );
}
