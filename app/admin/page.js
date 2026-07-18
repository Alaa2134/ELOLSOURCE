'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSettings, saveSettings, listInvoices } from '@/lib/db';
import { num } from '@/lib/format';

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
              <span>كلمة سر استعلام الأسعار من الموبايل</span>
              <input dir="ltr" value={s.inquiryPassword} onChange={(e) => setS({ ...s, inquiryPassword: e.target.value })} />
            </label>
          </div>
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
