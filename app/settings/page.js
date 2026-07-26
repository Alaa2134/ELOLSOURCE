'use client';
import { useEffect, useRef, useState } from 'react';
import {
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  countBackup,
  markBackupDone,
  backupInfo,
  cloudEnabled,
  syncPull,
  getCloudConfig,
  setCloudConfig,
  pushAllToCloud,
} from '@/lib/db';
import { dangerBox } from '@/lib/ui';
import { fmtDate } from '@/lib/format';

// أسماء الجداول بالعربي — بتظهر للمستخدم قبل الاسترجاع عشان يعرف الملف فيه إيه
const LABELS = {
  products: 'صنف', customers: 'عميل', invoices: 'فاتورة بيع', payments: 'سند قبض',
  expenses: 'مصروف', suppliers: 'مورد', purchases: 'فاتورة شراء/طلب',
  quotes: 'عرض سعر', stocktakes: 'جرد', daycloses: 'إقفال يومية',
};

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [sbMsg, setSbMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [bk, setBk] = useState({ at: null, days: null });
  const fileRef = useRef(null);

  useEffect(() => {
    setS(getSettings());
    setBk(backupInfo());
    const c = getCloudConfig();
    if (c) {
      setSbUrl(c.url);
      setSbKey(c.key);
    }
  }, []);
  if (!s) return null;

  async function saveCloud() {
    setTesting(true);
    setSbMsg('⏳ جاري الاختبار...');
    setCloudConfig(sbUrl, sbKey);
    if (!sbUrl || !sbKey) {
      setSbMsg('تم مسح إعداد السحابة — البرنامج شغال محلي');
      setTesting(false);
      return;
    }
    const ok = await syncPull();
    if (!ok) {
      setSbMsg('❌ الاتصال فشل — راجع الـ URL والمفتاح وتأكد إنك شغّلت ملف schema.sql في Supabase');
      setTesting(false);
      return;
    }
    // رفعة شاملة: كل البيانات الموجودة على الجهاز بتطلع للسحابة دلوقتي
    setSbMsg('⏳ الاتصال ناجح — جاري رفع كل البيانات للسحابة (الأصناف والفواتير وكل حاجة)...');
    const push = await pushAllToCloud();
    setSbMsg(push.ok
      ? `✅ تمام! اترفع ${push.count} سجل للسحابة — الأصناف والفواتير بقوا أونلاين ومتزامنين على كل الأجهزة`
      : `⚠️ الاتصال شغال بس الرفع الشامل واجه مشكلة: ${push.error || ''} — جرب زرار "مزامنة الآن"`);
    setTesting(false);
  }

  // حفظ تلقائي: أي تعديل بيتخزن على طول من غير أزرار
  function set(patch) {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    setMsg('✅ اتحفظ');
    clearTimeout(set._t);
    set._t = setTimeout(() => setMsg(''), 1500);
  }

  function downloadBackup() {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
    a.href = url;
    a.download = `نسخة-السقا-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markBackupDone();
    setBk(backupInfo());
    setMsg('✅ النسخة اتنزّلت على جهازك — خليها في مكان أمان');
    setTimeout(() => setMsg(''), 3000);
  }

  // الاسترجاع بيمسح كل البيانات الحالية — لازم تأكيد صريح بعد ما نوريه الملف فيه إيه
  async function restoreBackup(e) {
    const f = e.target.files?.[0];
    e.target.value = ''; // عشان لو اختار نفس الملف تاني يشتغل
    if (!f) return;
    let text;
    try { text = await f.text(); } catch { setMsg('❌ مقدرناش نقرا الملف'); return; }

    let data;
    try { data = JSON.parse(text); } catch { setMsg('❌ الملف ده مش نسخة احتياطية'); return; }
    const c = countBackup(data);
    const lines = Object.entries(LABELS)
      .filter(([k]) => c[k] !== undefined)
      .map(([k, label]) => `• ${label}: ${c[k]}`);
    if (!lines.length) { setMsg('❌ الملف ده مش نسخة احتياطية'); return; }

    const ok = await dangerBox({
      title: '⚠️ استرجاع نسخة احتياطية',
      icon: '📤',
      message:
        `الملف فيه:\n${lines.join('\n')}\n\n` +
        `الاسترجاع هيمسح كل البيانات الموجودة على الجهاز دلوقتي ويحطّ اللي في الملف مكانها.\n` +
        `لو مش متأكد، نزّل نسخة من الوضع الحالي الأول.`,
      confirmText: 'أيوة، استرجع',
    });
    if (!ok) return;

    try {
      importBackup(text);
      setMsg('✅ تم الاسترجاع — جاري إعادة التحميل...');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setMsg(`❌ ${err.message || 'ملف غير صالح'}`);
    }
  }

  return (
    <div>
      <div className="grid cols-2">
        <div className="card">
          <h3>🏢 بيانات الشركة (تظهر في الفاتورة)</h3>
          <div className="grid" style={{ gap: 10 }}>
            <label className="field"><span>اسم الشركة</span>
              <input value={s.companyName} onChange={(e) => set({ companyName: e.target.value })} /></label>
            <label className="field"><span>عنوان المستند (مثل: بيان أسعار / فاتورة مبيعات)</span>
              <input value={s.docTitle} onChange={(e) => set({ docTitle: e.target.value })} /></label>
            <label className="field"><span>حرف اللوجو</span>
              <input value={s.logoText} maxLength={2} onChange={(e) => set({ logoText: e.target.value })} /></label>
            <label className="field"><span>التليفونات (تظهر أسفل الفاتورة)</span>
              <input value={s.phones} onChange={(e) => set({ phones: e.target.value })} /></label>
            <label className="field"><span>العملة</span>
              <input value={s.currency} onChange={(e) => set({ currency: e.target.value })} /></label>
          </div>
        </div>

        <div className="card">
          <h3>⚙️ إعدادات النظام</h3>
          <div className="grid" style={{ gap: 10 }}>
            <label className="field"><span>الرقم السري للدخول</span>
              <input value={s.pin} onChange={(e) => set({ pin: e.target.value })} /></label>
            <label className="field"><span>بداية ترقيم الفواتير</span>
              <input type="number" value={s.invoiceStart} onChange={(e) => set({ invoiceStart: Number(e.target.value) || 1 })} /></label>
            <label className="field"><span>حد تنبيه نقص المخزون</span>
              <input type="number" value={s.lowStock} onChange={(e) => set({ lowStock: Number(e.target.value) || 0 })} /></label>
            <label className="field"><span>رابط الموقع على فيرسيل (لروابط الفواتير المرسلة للعملاء)</span>
              <input dir="ltr" placeholder="https://saqqa.vercel.app" value={s.publicBaseUrl}
                onChange={(e) => set({ publicBaseUrl: e.target.value.trim() })} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={s.arabicDigits}
                onChange={(e) => set({ arabicDigits: e.target.checked })} />
              عرض الأرقام بالهندية (١٢٣) في الفواتير والشاشات
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>🛒 متجر الجملة للتجار</h3>
        <div className="grid cols-2" style={{ gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.store.showOnInvoice}
              onChange={(e) => set({ store: { ...s.store, showOnInvoice: e.target.checked } })} />
            اطبع QR ولينك المتجر على الفاتورة
          </label>
          <label className="field"><span>أقل قيمة للطلب من المتجر (0 = بدون حد)</span>
            <input type="number" min="0" step="any" value={s.store.minOrder}
              onChange={(e) => set({ store: { ...s.store, minOrder: Number(e.target.value) || 0 } })} /></label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          المتجر لتجار الجملة — بيعرض الأصناف بسعر البيع. شارك رابط المتجر (<code dir="ltr">{(s.publicBaseUrl || '') + '/store'}</code>) مع تجارك، أو خليهم يمسحوا الـ QR من الفاتورة.
        </p>
      </div>

      <div className="card">
        <h3>☁️ التخزين السحابي والمزامنة اللحظية</h3>
        <p style={{ marginBottom: 10 }}>
          {cloudEnabled()
            ? <span className="badge green">✅ متصل بـ Supabase — كل البيانات بتتزامن تلقائياً</span>
            : <span className="badge orange">💾 تخزين محلي فقط — فعّل السحابة بالخانتين دول</span>}
        </p>
        <div className="grid cols-2" style={{ marginBottom: 10, alignItems: 'end' }}>
          <label className="field">
            <span>Supabase Project URL</span>
            <input dir="ltr" placeholder="https://xxxx.supabase.co" value={sbUrl} onChange={(e) => setSbUrl(e.target.value.trim())} />
          </label>
          <label className="field">
            <span>Supabase anon key</span>
            <input dir="ltr" placeholder="eyJhbGciOi..." value={sbKey} onChange={(e) => setSbKey(e.target.value.trim())} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn-accent" onClick={saveCloud} disabled={testing}>☁️ حفظ واختبار الاتصال</button>
          {sbMsg && <b style={{ fontSize: 13 }}>{sbMsg}</b>}
        </div>
        {cloudEnabled() && (
          <button className="btn-green" onClick={async () => { await syncPull(); setMsg('✅ تمت المزامنة'); }}>
            🔄 مزامنة الآن
          </button>
        )}
      </div>

      <div className="card">
        <h3>💾 نسخة احتياطية على جهازك</h3>
        <p style={{ marginBottom: 10 }}>
          {bk.days === null
            ? <span className="badge red">⚠️ عمرك ما نزّلت نسخة احتياطية على الجهاز ده</span>
            : bk.days >= 7
              ? <span className="badge orange">⚠️ آخر نسخة من {bk.days} يوم ({fmtDate(bk.at.slice(0, 10))}) — نزّل واحدة جديدة</span>
              : <span className="badge green">✅ آخر نسخة {bk.days === 0 ? 'النهارده' : `من ${bk.days} يوم`} ({fmtDate(bk.at.slice(0, 10))})</span>}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-accent" style={{ fontSize: 15, padding: '10px 18px' }} onClick={downloadBackup}>
            📥 نزّل نسخة دلوقتي
          </button>
          <button onClick={() => fileRef.current?.click()}>📤 استرجاع من ملف</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={restoreBackup} />
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
          الملف بيتنزّل على الجهاز على طول — من غير أي إعداد ولا إنترنت. فيه كل حاجة: الأصناف والعملاء
          والفواتير والمشتريات وعروض الأسعار والمصاريف والإعدادات.<br />
          💡 خد نسخة كل أسبوع وحطّها على فلاشة أو ابعتها لنفسك على واتساب.
        </p>
      </div>

      {msg && <div className="save-flash">{msg}</div>}
    </div>
  );
}
