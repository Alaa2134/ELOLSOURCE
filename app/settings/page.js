'use client';
import { useEffect, useRef, useState } from 'react';
import {
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  cloudEnabled,
  syncPull,
  getCloudConfig,
  setCloudConfig,
  pushAllToCloud,
} from '@/lib/db';

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [sbMsg, setSbMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setS(getSettings());
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
    a.href = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
    a.download = `saqqa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function restoreBackup(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackup(reader.result);
        setMsg('✅ تم استرجاع النسخة الاحتياطية — أعد تحميل الصفحة');
      } catch {
        setMsg('❌ ملف غير صالح');
      }
    };
    reader.readAsText(f);
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
        <h3>🛒 متجر أونلاين وسعر المخزن</h3>
        <div className="grid cols-2" style={{ gap: 12, alignItems: 'end' }}>
          <label className="field">
            <span>كلمة سر "سعر المخزن" في المتجر</span>
            <input dir="ltr" value={s.store.storePassword} onChange={(e) => set({ store: { ...s.store, storePassword: e.target.value } })} placeholder="9988" />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={s.store.showOnInvoice}
              onChange={(e) => set({ store: { ...s.store, showOnInvoice: e.target.checked } })} />
            اطبع QR ولينك المتجر وكلمة السر على الفاتورة
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          العميل اللي معاه كلمة السر دي، لما يكتبها في المتجر، الأسعار بتتحوّل تلقائياً لخانة "سعر المخزن" في الأصناف — نفس المنتجات بالظبط، الفرق بس مصدر السعر. (سيب كلمة السر فاضية لو مش عايز الميزة دي)
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={downloadBackup}>📥 تحميل نسخة احتياطية</button>
          <button onClick={() => fileRef.current?.click()}>📤 استرجاع نسخة احتياطية</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={restoreBackup} />
          {cloudEnabled() && (
            <button className="btn-green" onClick={async () => { await syncPull(); setMsg('✅ تمت المزامنة'); }}>
              🔄 مزامنة الآن
            </button>
          )}
        </div>
      </div>

      {msg && <div className="save-flash">{msg}</div>}
    </div>
  );
}
