'use client';
import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '@/lib/db';
import { gatewayStatus, gatewayQr, gatewaySend, gatewayLogout } from '@/lib/wa';

export default function WhatsappPage() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  useEffect(() => {
    if (!settings?.wa?.gatewayUrl) return;
    let alive = true;
    async function poll() {
      const st = await gatewayStatus(settings.wa);
      if (!alive) return;
      setStatus(st);
      if (st.available && !st.connected) {
        try {
          const q = await gatewayQr(settings.wa);
          if (alive) setQr(q.qr || '');
        } catch { /* لسه مفيش QR */ }
      } else {
        setQr('');
      }
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [settings]);

  if (!settings) return null;
  const wa = settings.wa;

  function update(patch) {
    const next = saveSettings({ wa: { ...wa, ...patch } });
    setSettings(next);
  }

  async function sendTest() {
    try {
      await gatewaySend(wa, testPhone, `رسالة تجريبية من نظام ${settings.companyName} ✅`);
      setMsg('✅ اتضافت للطابور — هتتبعت خلال ثواني/دقايق حسب إعدادات الأمان');
    } catch (e) {
      setMsg('❌ فشل الإرسال: ' + e.message);
    }
  }

  return (
    <div>
      <div className="grid cols-2">
        <div className="card">
          <h3>🔌 بوابة الواتساب (تسجيل دخول بالـ QR)</h3>
          <p className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
            شغّل خدمة <code>whatsapp-gateway</code> على أي جهاز/سيرفر (الخطوات في README) وحط رابطها هنا،
            وامسح الـ QR من واتساب زي واتساب ويب بالظبط.
          </p>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>رابط البوابة</span>
            <input dir="ltr" placeholder="http://localhost:3900" value={wa.gatewayUrl}
              onChange={(e) => update({ gatewayUrl: e.target.value.trim() })} />
          </label>
          <label className="field" style={{ marginBottom: 12 }}>
            <span>رمز الحماية (Token)</span>
            <input dir="ltr" value={wa.token} onChange={(e) => update({ token: e.target.value.trim() })} />
          </label>

          {!wa.gatewayUrl ? (
            <span className="badge orange">لم يتم ضبط رابط البوابة</span>
          ) : !status ? (
            <span className="badge blue">جاري الفحص...</span>
          ) : !status.available ? (
            <span className="badge red">❌ البوابة غير متاحة — تأكد إنها شغالة</span>
          ) : status.connected ? (
            <div>
              <span className="badge green">✅ متصل بالواتساب {status.me ? `(${status.me})` : ''}</span>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <span className="badge blue">في الطابور: {status.queue ?? 0}</span>
                <span className="badge blue">اتبعت النهارده: {status.sentToday ?? 0}</span>
                <button className="btn-sm btn-red" onClick={async () => { await gatewayLogout(wa); setStatus(null); }}>
                  تسجيل خروج
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ marginBottom: 8 }}>📱 امسح الكود من واتساب ← الأجهزة المرتبطة ← ربط جهاز</p>
              {qr ? <img src={qr} alt="QR" width={240} height={240} /> : <span className="badge orange">جاري توليد QR...</span>}
            </div>
          )}
        </div>

        <div className="card">
          <h3>✉️ رسالة الشكر بعد الفاتورة</h3>
          <label className="field" style={{ marginBottom: 10 }}>
            <span>نص الرسالة — متغيرات: {'{name} {number} {total} {currency} {link} {company}'}</span>
            <textarea rows={7} value={wa.thanksTemplate} onChange={(e) => update({ thanksTemplate: e.target.value })} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={wa.autoSend}
              onChange={(e) => update({ autoSend: e.target.checked })} />
            إرسال تلقائي بعد حفظ كل فاتورة (عبر البوابة)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={wa.sendInvoiceLink}
              onChange={(e) => update({ sendInvoiceLink: e.target.checked })} />
            إرفاق رابط الفاتورة الإلكترونية في الرسالة
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input dir="ltr" placeholder="رقم للتجربة 01xxxxxxxxx" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
            <button className="btn-green" onClick={sendTest} disabled={!status?.connected}>إرسال تجربة</button>
          </div>
          {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h3>📊 تقرير آخر اليوم للأدمن</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.dailyReport.enabled}
              onChange={(e) => {
                const next = saveSettings({ dailyReport: { ...settings.dailyReport, enabled: e.target.checked } });
                setSettings(next);
              }} />
            تفعيل التقرير اليومي التلقائي
          </label>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>الساعة (24 ساعة)</span>
            <input type="number" min="0" max="23" value={settings.dailyReport.hour}
              onChange={(e) => setSettings(saveSettings({ dailyReport: { ...settings.dailyReport, hour: Number(e.target.value) || 21 } }))} />
          </label>
          <p className="muted" style={{ fontSize: 12 }}>
            مبيعات ومحصل ومصاريف وصافي الدرج وفلوس المندوبين — بيتبعت لرقم الأدمن اللي في كارت الإشعارات.
          </p>
        </div>

        <div className="card">
          <h3>🔔 إشعارات فورية للأدمن</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.alerts.enabled}
              onChange={(e) => setSettings(saveSettings({ alerts: { ...settings.alerts, enabled: e.target.checked } }))} />
            تفعيل الإشعارات
          </label>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>رقم واتساب الأدمن</span>
            <input dir="ltr" placeholder="01xxxxxxxxx" value={settings.alerts.adminPhone}
              onChange={(e) => setSettings(saveSettings({ alerts: { ...settings.alerts, adminPhone: e.target.value.trim() } }))} />
          </label>
          <label className="field">
            <span>إشعار لو فاتورة أكبر من</span>
            <input type="number" min="0" value={settings.alerts.bigInvoice}
              onChange={(e) => setSettings(saveSettings({ alerts: { ...settings.alerts, bigInvoice: Number(e.target.value) || 0 } }))} />
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            بيوصلك إشعار عند: فاتورة كبيرة، حذف فاتورة، وعجز في إقفال اليومية.
          </p>
        </div>

        <div className="card">
          <h3>📕 تذكير المديونيات الأسبوعي</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.debtReminder.enabled}
              onChange={(e) => setSettings(saveSettings({ debtReminder: { ...settings.debtReminder, enabled: e.target.checked } }))} />
            تفعيل التذكير الأسبوعي
          </label>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>اليوم</span>
            <select value={settings.debtReminder.weekday}
              onChange={(e) => setSettings(saveSettings({ debtReminder: { ...settings.debtReminder, weekday: Number(e.target.value) } }))}>
              <option value={0}>الأحد</option><option value={1}>الاثنين</option><option value={2}>الثلاثاء</option>
              <option value={3}>الأربعاء</option><option value={4}>الخميس</option><option value={5}>الجمعة</option>
              <option value={6}>السبت</option>
            </select>
          </label>
          <label className="field">
            <span>نص الرسالة — متغيرات: {'{name} {debt} {currency} {company}'}</span>
            <textarea rows={4} value={settings.debtReminder.template}
              onChange={(e) => setSettings(saveSettings({ debtReminder: { ...settings.debtReminder, template: e.target.value } }))} />
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            بيتبعت لكل عميل عليه مديونية (بنفس نظام الحماية: تأخير عشوائي وحد يومي).
          </p>
        </div>
      </div>

      <div className="card">
        <h3>🛡️ نظام الحماية من الحظر</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          البوابة بتطبق القواعد دي تلقائياً — وتقدر تعدلها من ملف الإعدادات بتاعها:
        </p>
        <ul style={{ paddingRight: 20, lineHeight: 2, fontSize: 14 }}>
          <li>⏱️ <b>تأخير عشوائي بين كل رسالة</b> (25–70 ثانية افتراضياً) — محاكاة للإرسال اليدوي.</li>
          <li>📊 <b>حد أقصى يومي</b> للرسائل (150 افتراضياً) بيتصفر كل يوم.</li>
          <li>🌙 <b>ساعات عمل</b> — مفيش إرسال بالليل؛ الرسائل بتستنى في الطابور للصبح.</li>
          <li>✅ <b>فحص الرقم</b> قبل الإرسال — مش بيبعت لأرقام مش على واتساب (الإرسال لأرقام غلط كتير أسرع طريق للحظر).</li>
          <li>💬 الرسائل <b>معاملات فقط</b> (فاتورة عميل اشترى فعلاً) مش إعلانات جماعية — ودي أهم قاعدة.</li>
        </ul>
        <p style={{ marginTop: 10, fontSize: 13 }} className="muted">
          ⚠️ نصيحة: استخدم رقم مخصص للشغل (مش رقمك الشخصي)، وسخّنه أول أسبوع بإرسال قليل، وبلاش روابط في أول رسالة
          لعميل جديد. وللأمان الكامل 100% في أي وقت تقدر تستخدم زر wa.me اليدوي — ده بيفتح واتساب العادي ومستحيل يتحظر.
        </p>
      </div>
    </div>
  );
}
