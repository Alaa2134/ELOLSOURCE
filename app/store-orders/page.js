'use client';
// 📥 طلبات الفواتير — الطلبات الجايّة من التجار أونلاين، بتتزامن على كل أجهزة المحل
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchStoreOrders, setStoreOrderStatus, deleteStoreOrder, getSettings, cloudEnabled, cloudTableMissing } from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';
import { waMeLink } from '@/lib/wa';
import { dangerBox } from '@/lib/ui';

export default function StoreOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // id مفتوح للتفاصيل
  const [showAll, setShowAll] = useState(false); // نعرض المنفّذ كمان؟ (افتراضي: الجديد بس)
  const [tableMissing, setTableMissing] = useState(false); // الجدول لسه متعملش في السحابة

  async function reload() {
    setLoading(true);
    setSettings(getSettings());
    setOrders(await fetchStoreOrders());
    setTableMissing(await cloudTableMissing('store_orders'));
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const cur = settings.currency;
  const isNew = (o) => !o.status || o.status === 'جديد';
  const newCount = orders.filter(isNew).length;
  const doneCount = orders.length - newCount;
  const visible = showAll ? orders : orders.filter(isNew); // الجديد بس افتراضياً — الصفحة ماتتكدّسش
  const storeUrl = (settings.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')) + '/store';

  function traderMsg(o) {
    return `أهلاً ${o.trader?.name} 🌹\nاستلمنا طلبك (${o.items?.length || 0} صنف بإجمالي ${num(o.total)} ${cur}) — جاري تجهيزه ونتواصل معاك.\n${settings.companyName}`;
  }

  async function convert(o) {
    // بنحوّل الطلب لفاتورة بيع في شاشة البيع (بتتملى تلقائياً)
    await setStoreOrderStatus(o.id, 'اتحول لفاتورة');
    sessionStorage.setItem('saqqa_store_order', JSON.stringify(o));
    router.push('/pos?storeOrder=' + o.id);
  }

  async function markDone(o) { await setStoreOrderStatus(o.id, 'اتنفّذ'); reload(); }
  async function remove(o) {
    if (!(await dangerBox({ title: 'حذف طلب', message: `تمسح طلب ${o.trader?.name}؟` }))) return;
    await deleteStoreOrder(o.id); reload();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h2 style={{ color: 'var(--brand)', margin: 0 }}>
          📥 طلبات الفواتير {newCount > 0 && <span className="badge red">{num(newCount, ar)} جديد</span>}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {doneCount > 0 && (
            <button onClick={() => setShowAll(!showAll)}>
              {showAll ? '📥 الجديد بس' : `🗂️ عرض المنفّذ كمان (${num(doneCount, ar)})`}
            </button>
          )}
          <button className="btn-primary" onClick={reload} disabled={loading}>{loading ? '⏳' : '🔄 تحديث'}</button>
        </div>
      </div>

      {!cloudEnabled() && (
        <div className="card"><p className="red-text">⚠️ لازم السحابة تكون متفعّلة عشان تستقبل طلبات المتجر (لوحة الأدمن ← المزامنة الأونلاين).</p></div>
      )}

      {tableMissing && (
        <div className="card" style={{ borderRight: '4px solid var(--red)', background: '#fff5f5' }}>
          <h3 style={{ color: 'var(--red)' }}>⚠️ استقبال الطلبات لسه مش متفعّل</h3>
          <p>جدول الطلبات لسه متعملش في السحابة — يعني <b>أي طلب التاجر هيبعته مش هيوصلك هنا</b> (هيوصل واتساب بس).</p>
          <p><b>الحل (دقيقتين، مرة واحدة):</b></p>
          <ol style={{ marginRight: 18 }}>
            <li>افتح <b>لوحة الأدمن</b> واضغط <b>«📋 انسخ كود الجداول»</b></li>
            <li>من Supabase: <b>SQL Editor ← New query</b> ← الصق الكود ← <b>Run</b></li>
            <li>ارجع هنا واضغط <b>🔄 تحديث</b></li>
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>الكود آمن ومتكرر — مش هيلمس أي بيانات موجودة، بس بيضيف الجداول الناقصة.</p>
        </div>
      )}

      <div className="card" style={{ background: '#f4f9f4', borderColor: 'var(--green)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>🔗 شارك رابط المتجر مع تجارك:</b>
          <code style={{ background: '#fff', padding: '4px 10px', borderRadius: 6, direction: 'ltr' }}>{storeUrl}</code>
          <button className="btn-sm btn-green" onClick={() => { navigator.clipboard?.writeText(storeUrl); }}>📋 نسخ</button>
          <a className="btn-sm btn" target="_blank" rel="noreferrer" href={storeUrl}>🔎 افتح المتجر</a>
        </div>
      </div>

      {loading && !orders.length && <p className="muted" style={{ padding: 20 }}>جاري التحميل...</p>}

      {!loading && !orders.length && (
        <div className="card"><p className="muted" style={{ textAlign: 'center', padding: 30 }}>
          لسه مفيش طلبات من المتجر. شارك رابط المتجر مع تجارك: <b>{(settings.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')) + '/store'}</b>
        </p></div>
      )}

      {!loading && orders.length > 0 && !visible.length && (
        <div className="card"><p className="muted" style={{ textAlign: 'center', padding: 20 }}>
          ✅ مفيش طلبات جديدة — كل الطلبات اتنفّذت. اضغط "عرض المنفّذ كمان" تشوف القديم.
        </p></div>
      )}

      {visible.map((o) => (
        <div key={o.id} className="card" style={isNew(o) ? { borderRight: '4px solid var(--accent)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <b style={{ fontSize: 16 }}>{o.source === 'مندوب' ? '🛵' : '🧑‍💼'} {o.trader?.name || 'تاجر'}</b>
              {isNew(o) ? <span className="badge red" style={{ marginRight: 8 }}>جديد</span>
                : <span className="badge green" style={{ marginRight: 8 }}>{o.status}</span>}
              {o.source === 'مندوب' && (
                <span className="badge blue" style={{ marginRight: 6 }}>
                  من المندوب{o.rep ? ` ${o.rep}` : ''}
                </span>
              )}
              <div className="muted" style={{ fontSize: 13 }} dir="ltr">{o.trader?.phone} · {fmtDate(o.createdAt, ar)} {fmtTime(o.createdAt, ar)}</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--brand)' }}>{num(o.total, ar)} {cur}</div>
              <div className="muted" style={{ fontSize: 13 }}>{num(o.items?.length || 0, ar)} صنف</div>
            </div>
          </div>
          {o.notes && <p className="muted" style={{ marginTop: 6 }}>📝 {o.notes}</p>}

          <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => setOpen(open === o.id ? null : o.id)}>
            {open === o.id ? '▲ إخفاء الأصناف' : '▼ عرض الأصناف'}
          </button>
          {open === o.id && (
            <table className="tbl" style={{ marginTop: 8 }}>
              <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {(o.items || []).map((it, i) => (
                  <tr key={i}><td>{it.name}</td><td><b>{num(it.qty, ar)}</b></td><td>{num(it.price, ar)}</td><td>{num(it.total, ar)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn-green" onClick={() => convert(o)}>🧾 حوّلها لفاتورة بيع</button>
            {o.trader?.phone && <a className="btn" target="_blank" rel="noreferrer" href={waMeLink(o.trader.phone, traderMsg(o))}>💬 واتساب التاجر</a>}
            {isNew(o) && <button onClick={() => markDone(o)}>✔️ علّمها اتنفّذت</button>}
            <button className="btn-sm btn-red" onClick={() => remove(o)}>🗑️ حذف</button>
          </div>
        </div>
      ))}
    </div>
  );
}
