'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listProducts,
  findProduct,
  listCustomers,
  saveCustomer,
  saveInvoice,
  nextInvoiceNumber,
  getSettings,
  customerDebt,
  settleCustomerDebt,
  getRole,
} from '@/lib/db';
import { num, todayISO, fmtDate, normalizePhone } from '@/lib/format';
import { buildMessage, invoiceLink, waMeLink, gatewaySend, gatewayStatus } from '@/lib/wa';
import ProductPicker from '@/components/ProductPicker';

const emptyRow = () => ({ code: '', name: '', qty: 1, price: '', disc: 0, notes: '' });

export default function PosPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [role, setRole] = useState('cashier');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [number, setNumber] = useState(0);
  const [payment, setPayment] = useState('نقدي');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [extraDisc, setExtraDisc] = useState(0);
  const [paid, setPaid] = useState('');
  const [prevDebt, setPrevDebt] = useState(0); // مديونية العميل السابقة
  const [includeDebt, setIncludeDebt] = useState(false); // إضافتها للفاتورة
  const [saved, setSaved] = useState(null);
  const [toast, setToast] = useState('');
  const tableRef = useRef(null);

  useEffect(() => {
    setSettings(getSettings());
    setRole(getRole() || 'cashier');
    setProducts(listProducts());
    setCustomers(listCustomers());
    setNumber(nextInvoiceNumber());
  }, []);

  // تنبيه المديونية عند اختيار العميل
  useEffect(() => {
    setPrevDebt(customerName ? customerDebt(customerName) : 0);
    setIncludeDebt(false);
  }, [customerName]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const canPrice = role === 'admin' || settings?.perms?.allowPriceEdit;
  const canDisc = role === 'admin' || settings?.perms?.allowDiscount;

  const lineTotal = (r) => Math.max(0, (Number(r.qty) || 0) * (Number(r.price) || 0) - (Number(r.disc) || 0));
  const subtotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0), [rows]);
  const lineDiscs = useMemo(() => rows.reduce((s, r) => s + (Number(r.disc) || 0), 0), [rows]);
  const debtAdd = includeDebt ? prevDebt : 0;
  const net = Math.max(0, subtotal - lineDiscs - (Number(extraDisc) || 0)) + debtAdd;
  const paidNum = paid === '' ? (payment === 'نقدي' ? net : 0) : Number(paid) || 0;
  const remaining = net - paidNum;

  function updateRow(i, patch) {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.code || last.name) next.push(emptyRow());
      return next;
    });
  }

  function removeRow(i) {
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [emptyRow()];
    });
  }

  function lookupCode(i, code) {
    const p = findProduct(code);
    if (p) {
      updateRow(i, { code: p.code, name: p.name, price: p.price });
      focusCell(i, 'qty');
    }
  }

  function focusCell(row, col) {
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector(`[data-r="${row}"][data-c="${col}"]`);
      if (el) { el.focus(); el.select?.(); }
    });
  }

  const COLS = ['code', 'name', 'qty', 'price', 'disc'];
  // Enter ينقل بين الخانات — وآخر خانة تنزل للصف اللي تحت (المسطرة مسافة عادية)
  function onKey(e, r, c) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (c === 'code' && e.target.value) { lookupCode(r, e.target.value); return; }
    const ci = COLS.indexOf(c);
    if (ci < COLS.length - 1) focusCell(r, COLS[ci + 1]);
    else focusCell(r + 1, 'code');
  }

  function selectCustomer(name) {
    setCustomerName(name);
    const c = customers.find((x) => x.name === name);
    if (c && c.phone) setCustomerPhone(c.phone);
  }

  async function save(andPrint) {
    const items = rows
      .filter((r) => (r.code || r.name) && Number(r.qty) > 0)
      .map((r) => ({
        code: r.code,
        name: r.name,
        qty: Number(r.qty) || 0,
        price: Number(r.price) || 0,
        disc: Number(r.disc) || 0,
        notes: r.notes || '',
        total: lineTotal(r),
      }));
    if (!items.length && !debtAdd) { showToast('⚠️ أضف صنف واحد على الأقل'); return; }

    if (customerName && !customers.find((c) => c.name === customerName)) {
      saveCustomer({ name: customerName, phone: customerPhone, address: '' });
    } else if (customerName && customerPhone) {
      const c = customers.find((x) => x.name === customerName);
      if (c && !c.phone) saveCustomer({ ...c, phone: customerPhone });
    }

    const inv = saveInvoice({
      number,
      date: todayISO(),
      type: 'بيع',
      payment,
      customer: { name: customerName || 'عميل نقدي', phone: customerPhone },
      items,
      totals: {
        subtotal,
        discount: lineDiscs + (Number(extraDisc) || 0),
        prevBalance: debtAdd,
        net,
        paid: paidNum,
        remaining,
      },
    });
    // لو ضفنا الحساب السابق، نصفّي الفواتير القديمة (الدين بقى متسجل هنا)
    if (debtAdd > 0) settleCustomerDebt(customerName, inv.number, inv.id);
    setSaved(inv);
    setProducts(listProducts());
    setCustomers(listCustomers());
    showToast(`✅ تم حفظ الفاتورة رقم ${inv.number}`);

    const wa = settings?.wa || {};
    if (wa.autoSend && wa.gatewayUrl && customerPhone) {
      try {
        const st = await gatewayStatus(wa);
        if (st.available && st.connected) {
          await gatewaySend(wa, customerPhone, thanksMessage(inv));
          showToast('💬 تمت إضافة رسالة الشكر لطابور الواتساب');
        }
      } catch {
        showToast('⚠️ تعذر الإرسال عبر بوابة الواتساب — استخدم زر wa.me');
      }
    }

    if (andPrint) router.push(`/print/${inv.id}?auto=1`);
  }

  function thanksMessage(inv) {
    return buildMessage(settings.wa.thanksTemplate, {
      name: inv.customer?.name,
      number: inv.number,
      total: inv.totals.net,
      currency: settings.currency,
      company: settings.companyName,
      link: settings.wa.sendInvoiceLink ? `📄 فاتورتك: ${invoiceLink(settings, inv.id)}` : '',
    });
  }

  function newInvoice() {
    setRows([emptyRow()]);
    setCustomerName('');
    setCustomerPhone('');
    setExtraDisc(0);
    setPaid('');
    setPayment('نقدي');
    setSaved(null);
    setPrevDebt(0);
    setIncludeDebt(false);
    setNumber(nextInvoiceNumber());
    focusCell(0, 'code');
  }

  if (!settings) return null;
  const ar = settings.arabicDigits;

  return (
    <div>
      <div className="pos-banner">
        <img src="/logo.jpg" alt="" className="banner-logo" />
        <h2>فـاتـورة بـيـع</h2>
        <img src="/logo.jpg" alt="" className="banner-logo" />
      </div>

      <div className="pos-wrap">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="grid cols-4" style={{ marginBottom: 12 }}>
            <label className="field">
              <span>رقم الفاتورة</span>
              <input value={number} onChange={(e) => setNumber(Number(e.target.value) || number)} />
            </label>
            <label className="field">
              <span>التاريخ</span>
              <input value={fmtDate(todayISO(), ar)} readOnly />
            </label>
            <label className="field">
              <span>نوع الدفع</span>
              <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option>نقدي</option>
                <option>آجل</option>
                <option>فيزا</option>
                <option>محفظة إلكترونية</option>
              </select>
            </label>
            <label className="field">
              <span>هاتف العميل (للواتساب)</span>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </label>
          </div>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>اسم العميل</span>
            <input
              list="customers-list"
              value={customerName}
              onChange={(e) => selectCustomer(e.target.value)}
              placeholder="عميل نقدي"
            />
            <datalist id="customers-list">
              {customers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </label>

          {prevDebt > 0 && !saved && (
            <div className={`debt-alert ${includeDebt ? 'ok' : ''}`}>
              {includeDebt ? (
                <>
                  ✅ تم إضافة الحساب السابق (<b>{num(prevDebt, ar)} {settings.currency}</b>) للفاتورة
                  <button className="btn-sm" onClick={() => setIncludeDebt(false)}>إلغاء</button>
                </>
              ) : (
                <>
                  ⚠️ تنبيه: العميل <b>{customerName}</b> عليه حساب سابق <b>{num(prevDebt, ar)} {settings.currency}</b>
                  <button className="btn-sm btn-red" onClick={() => setIncludeDebt(true)}>➕ إضافة للفاتورة</button>
                </>
              )}
            </div>
          )}

          <div style={{ overflowX: 'visible' }}>
            <table className="pos-grid" ref={tableRef}>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>م</th>
                  <th style={{ width: 90 }}>رقم الصنف</th>
                  <th>اسم الصنف</th>
                  <th style={{ width: 70 }}>الكمية</th>
                  <th style={{ width: 90 }}>السعر</th>
                  {canDisc && <th style={{ width: 80 }}>خصم</th>}
                  <th style={{ width: 100 }}>الإجمالي</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="rownum">{num(i + 1, ar)}</td>
                    <td>
                      <input
                        className="num"
                        data-r={i} data-c="code"
                        value={r.code}
                        onChange={(e) => updateRow(i, { code: e.target.value })}
                        onKeyDown={(e) => onKey(e, i, 'code')}
                        onBlur={(e) => e.target.value && !r.name && lookupCode(i, e.target.value)}
                        placeholder="كود"
                      />
                    </td>
                    <td>
                      <ProductPicker
                        dataR={i} dataC="name"
                        value={r.name}
                        products={products}
                        arabicDigits={ar}
                        onType={(v) => updateRow(i, { name: v })}
                        onSelect={(p) => { updateRow(i, { code: p.code, name: p.name, price: p.price }); focusCell(i, 'qty'); }}
                        onNavKey={(e) => onKey(e, i, 'name')}
                      />
                    </td>
                    <td>
                      <input
                        className="num" type="number" min="0" step="any"
                        data-r={i} data-c="qty"
                        value={r.qty}
                        onChange={(e) => updateRow(i, { qty: e.target.value })}
                        onKeyDown={(e) => onKey(e, i, 'qty')}
                      />
                    </td>
                    <td>
                      <input
                        className="num" type="number" min="0" step="any"
                        data-r={i} data-c="price"
                        value={r.price}
                        readOnly={!canPrice}
                        onChange={(e) => updateRow(i, { price: e.target.value })}
                        onKeyDown={(e) => onKey(e, i, 'price')}
                      />
                    </td>
                    {canDisc && (
                      <td>
                        <input
                          className="num" type="number" min="0" step="any"
                          data-r={i} data-c="disc"
                          value={r.disc}
                          onChange={(e) => updateRow(i, { disc: e.target.value })}
                          onKeyDown={(e) => onKey(e, i, 'disc')}
                        />
                      </td>
                    )}
                    <td className="total-cell">{num(lineTotal(r), ar)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn-sm btn-red" tabIndex={-1} onClick={() => removeRow(i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            💡 اكتب الكود أو الاسم وهتظهر الاقتراحات — Enter بينقلك بين الخانات، وآخر خانة بتنزل للسطر الجديد.
          </p>
        </div>

        <div className="pos-side">
          <div className="box pos-totals">
            <div className="row"><span>الإجمالي</span><b>{num(subtotal, ar)} {settings.currency}</b></div>
            {canDisc && <div className="row"><span>خصم الأصناف</span><b className="red-text">{num(lineDiscs, ar)}</b></div>}
            {canDisc && (
              <div className="row" style={{ alignItems: 'center' }}>
                <span>خصم إضافي</span>
                <input
                  type="number" min="0" step="any"
                  style={{ width: 90, textAlign: 'center' }}
                  value={extraDisc}
                  onChange={(e) => setExtraDisc(e.target.value)}
                />
              </div>
            )}
            {debtAdd > 0 && (
              <div className="row"><span>حساب سابق</span><b className="red-text">+{num(debtAdd, ar)}</b></div>
            )}
            <div className="row big"><span>الصافي</span><span>{num(net, ar)} {settings.currency}</span></div>
            <div className="row" style={{ alignItems: 'center', marginTop: 6 }}>
              <span>المدفوع نقدي</span>
              <input
                type="number" min="0" step="any"
                style={{ width: 110, textAlign: 'center' }}
                value={paid === '' ? paidNum : paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </div>
            <div className="row">
              <span>{remaining >= 0 ? 'الباقي آجل على العميل' : 'الباقي للعميل'}</span>
              <b className={remaining > 0 ? 'red-text' : 'green-text'}>{num(Math.abs(remaining), ar)}</b>
            </div>
          </div>

          <div className="box" style={{ display: 'grid', gap: 8 }}>
            {!saved ? (
              <>
                <button className="btn-green" style={{ justifyContent: 'center' }} onClick={() => save(false)}>💾 حفظ الفاتورة</button>
                <button className="btn-accent" style={{ justifyContent: 'center' }} onClick={() => save(true)}>🖨️ حفظ وطباعة</button>
              </>
            ) : (
              <>
                <div className="badge green" style={{ textAlign: 'center', padding: 8 }}>
                  ✅ تم حفظ فاتورة رقم {num(saved.number, ar)}
                </div>
                <button className="btn-accent" style={{ justifyContent: 'center' }} onClick={() => router.push(`/print/${saved.id}?auto=1`)}>
                  🖨️ طباعة الفاتورة
                </button>
                {customerPhone && (
                  <a
                    className="btn btn-green"
                    style={{ justifyContent: 'center' }}
                    target="_blank"
                    rel="noreferrer"
                    href={waMeLink(customerPhone, thanksMessage(saved))}
                  >
                    💬 إرسال شكر + الفاتورة واتساب
                  </a>
                )}
                <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={newInvoice}>➕ فاتورة جديدة</button>
              </>
            )}
          </div>

          {customerPhone && !saved && normalizePhone(customerPhone).length < 11 && (
            <div className="box"><span className="red-text">⚠️ تأكد من رقم الهاتف</span></div>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
