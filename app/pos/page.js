'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listProducts,
  findProduct,
  listCustomers,
  saveCustomer,
  saveInvoice,
  updateInvoice,
  getInvoice,
  nextInvoiceNumber,
  listInvoices,
  getSettings,
  customerDebt,
  settleCustomerDebt,
  getRole,
  getCashierName,
  listReps,
} from '@/lib/db';
import { num, todayISO, fmtDate, normalizePhone } from '@/lib/format';
import { buildMessage, invoiceLink, waMeLink, gatewaySend, gatewayStatus, notifyAdmin } from '@/lib/wa';
import { confirmBox, promptBox } from '@/lib/ui';
import ProductPicker from '@/components/ProductPicker';
import BarcodeScanner from '@/components/BarcodeScanner';

// صفارة تأكيد المسح
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1400;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

// صفارة تحذير (نغمة منخفضة متكررة) — لما البيع يقل عن الحد الأدنى
function warnBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = 320;
      gain.gain.value = 0.18;
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.14);
    });
  } catch {}
}

const emptyRow = () => ({ code: '', name: '', qty: 1, price: '', disc: 0, notes: '', unit: '' });

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
  const [rep, setRep] = useState(''); // المندوب اللي هيطلع بالفاتورة
  const [reps, setReps] = useState([]);
  const [prevDebt, setPrevDebt] = useState(0); // مديونية العميل السابقة
  const [includeDebt, setIncludeDebt] = useState(false); // إضافتها للفاتورة
  const [saved, setSaved] = useState(null);
  const [toast, setToast] = useState('');
  const [scanning, setScanning] = useState(false); // كاميرا الباركود
  const [isMobile, setIsMobile] = useState(false); // موبايل؟ (عشان الكاميرا)
  const [editingInv, setEditingInv] = useState(null); // فاتورة محفوظة مفتوحة للقراءة والتعديل
  const [navPos, setNavPos] = useState({ pos: 0, total: 0 });
  const tableRef = useRef(null);
  const scanBuf = useRef({ txt: '', t: 0 }); // بافر سكانر الباركود USB/بلوتوث
  const editLoadRef = useRef(false); // بيمنع فحص المديونية من مسح بيانات الفاتورة المفتوحة

  const DRAFT_KEY = 'saqqa_pos_draft';

  useEffect(() => {
    setSettings(getSettings());
    setRole(getRole() || 'cashier');
    setProducts(listProducts());
    setCustomers(listCustomers());
    setReps(listReps());
    // كشف الموبايل (فيه كاميرا خلفية ولمس) عشان زرار الكاميرا
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const mob = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    setIsMobile(touch && mob);
    // جايين من طلب متجر؟ نملأ الفاتورة بأصنافه وبيانات التاجر تلقائياً
    try {
      const soId = new URLSearchParams(window.location.search).get('storeOrder');
      if (soId) {
        const o = JSON.parse(sessionStorage.getItem('saqqa_store_order') || 'null');
        if (o && o.id === soId) {
          setRows([
            ...(o.items || []).map((it) => ({ code: it.code || '', name: it.name, qty: it.qty, price: it.price, disc: 0, notes: '', unit: '' })),
            emptyRow(),
          ]);
          setCustomerName(o.trader?.name || '');
          setCustomerPhone(o.trader?.phone || '');
          setNumber(nextInvoiceNumber());
          sessionStorage.removeItem('saqqa_store_order');
          showToast('🛒 اتملت الفاتورة من طلب المتجر — راجعها واحفظها');
          return;
        }
      }
    } catch {}
    // استرجاع الفاتورة اللي كانت مفتوحة (لو النور قطع أو البرنامج اتقفل فجأة)
    let restored = false;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && (d.rows?.some((r) => r.code || r.name) || d.customerName)) {
        setRows(d.rows?.length ? d.rows : [emptyRow()]);
        setCustomerName(d.customerName || '');
        setCustomerPhone(d.customerPhone || '');
        setPayment(d.payment || 'نقدي');
        setRep(d.rep || '');
        setExtraDisc(d.extraDisc || 0);
        setPaid(d.paid ?? '');
        setNumber(d.number || nextInvoiceNumber());
        if (d.editingId) {
          const orig = getInvoice(d.editingId);
          if (orig) setEditingInv(orig);
        }
        restored = true;
        showToast('🔄 استرجعنا الفاتورة اللي كانت مفتوحة — كمّل من حيث وقفت');
      }
    } catch {}
    if (!restored) setNumber(nextInvoiceNumber());
  }, []);

  // حفظ تلقائي مستمر لكل حاجة بتتكتب — أي صنف بيتجمع بيتحفظ فوراً
  useEffect(() => {
    if (!settings || saved) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ rows, number, payment, customerName, customerPhone, extraDisc, paid, rep, editingId: editingInv?.id })
      );
    } catch {}
  }, [rows, number, payment, customerName, customerPhone, extraDisc, paid, rep, saved, settings, editingInv]);

  // سكانر الباركود USB/بلوتوث: بيكتب بسرعة عالية وينهي بـ Enter — بنلتقطه من أي مكان في الشاشة
  useEffect(() => {
    function onKeyGlobal(e) {
      const now = Date.now();
      const buf = scanBuf.current;
      // لو التوقيت بين الحروف بطيء (كتابة يدوية) نصفّر البافر
      if (now - buf.t > 120) buf.txt = '';
      buf.t = now;
      if (e.key === 'Enter') {
        const code = buf.txt.trim();
        buf.txt = '';
        // سكانر حقيقي = 4 حروف أو أكتر اتكتبوا بسرعة؛ ولو الكتابة كانت في خانة نسيبها للخانة
        if (code.length >= 4 && findProduct(code)) {
          const active = document.activeElement;
          const inGrid = active && active.closest && active.closest('.pos-grid');
          if (!inGrid) { e.preventDefault(); addByScan(code); }
        }
        return;
      }
      if (e.key.length === 1) buf.txt += e.key;
    }
    window.addEventListener('keydown', onKeyGlobal);
    return () => window.removeEventListener('keydown', onKeyGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, customerName]);

  // اختصارات الكيبورد للكاشير: F2 فاتورة جديدة · F4 حفظ وطباعة · F3 ركّز على الصنف
  useEffect(() => {
    function onFn(e) {
      if (e.key === 'F2') { e.preventDefault(); newInvoice(); }
      else if (e.key === 'F4') { e.preventDefault(); if (!saved) save(true); }
      else if (e.key === 'F3') { e.preventDefault(); focusCell(0, 'code'); }
    }
    window.addEventListener('keydown', onFn);
    return () => window.removeEventListener('keydown', onFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, rows, customerName, payment, paid, extraDisc, rep, editingInv]);

  // تنبيه المديونية عند اختيار العميل — بيتعطل لحظة فتح فاتورة محفوظة عشان قيمها المسجلة متتمسحش
  useEffect(() => {
    if (editLoadRef.current) { editLoadRef.current = false; return; }
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

  // السعر حسب نوع العميل: نقدي = سعر البيع · تاجر جملة = السعر المبدائي
  function priceFor(p, name = customerName) {
    const c = customers.find((x) => x.name === name);
    if (c?.priceType === 'تاجر جملة' && Number(p.cost) > 0) return p.cost;
    return p.price;
  }

  // الحد الأدنى المسموح لبيع الصنف ده (حسب نوع العميل) — 0 يعني مفيش صنف/سعر
  function minPriceOf(r) {
    if (r.unit === 'pack') return 0; // العبوة سعرها الخاص
    const p = products.find((x) => String(x.code) === String(r.code));
    return p ? Number(priceFor(p)) || 0 : 0;
  }
  // الصف بيبيع تحت الحد الأدنى؟
  function belowMin(r) {
    const m = minPriceOf(r);
    return m > 0 && Number(r.price) > 0 && Number(r.price) < m;
  }

  // تغيير السعر مع تحذير بصوت لو نزل تحت الحد الأدنى للبيع
  function onPriceChange(i, val) {
    setRows((prev) => {
      const wasBelow = belowMin(prev[i]);
      const next = prev.map((r, idx) => (idx === i ? { ...r, price: val } : r));
      const nowBelow = belowMin(next[i]);
      if (nowBelow && !wasBelow) {
        warnBeep();
        const m = minPriceOf(next[i]);
        showToast(`⚠️ السعر أقل من الحد الأدنى للبيع (${num(m, ar)} ${settings.currency}) — راجع "${next[i].name}"`);
      }
      const last = next[next.length - 1];
      if (last.code || last.name) next.push(emptyRow());
      return next;
    });
  }

  function lookupCode(i, code) {
    const p = findProduct(code);
    if (p) {
      updateRow(i, { code: p.code, name: p.name, price: priceFor(p), unit: '' });
      focusCell(i, 'qty');
    }
  }

  // إضافة صنف بالمسح (كاميرا أو سكانر باركود): الصنف بيتضاف — ولو اتمسح تاني الكمية بتزيد
  function addByScan(code) {
    const p = products.find(
      (x) => String(x.barcode || '') === code || String(x.code) === code
    );
    if (!p) { showToast(`⚠️ الباركود مش متسجل: ${code}`); return; }
    setRows((prev) => {
      let next;
      const i = prev.findIndex((r) => String(r.code) === String(p.code) && r.unit !== 'pack');
      if (i >= 0) {
        next = prev.map((r, idx) => (idx === i ? { ...r, qty: (Number(r.qty) || 0) + 1 } : r));
      } else {
        next = [...prev];
        const row = { code: p.code, name: p.name, qty: 1, price: priceFor(p), disc: 0, notes: '', unit: '' };
        const empty = next.findIndex((r) => !r.code && !r.name);
        if (empty >= 0) next[empty] = row;
        else next.push(row);
      }
      const last = next[next.length - 1];
      if (last.code || last.name) next.push(emptyRow());
      return next;
    });
    beep();
    showToast(`✅ ${p.name}`);
  }

  // تبديل الوحدة: قطعة أو عبوة (كرتونة/دستة) — بيغير السعر وخصم المخزون
  function toggleUnit(i, r) {
    const p = products.find((x) => String(x.code) === String(r.code));
    if (!p || !(Number(p.packQty) > 0) || !(Number(p.packPrice) > 0)) return;
    if (r.unit === 'pack') updateRow(i, { unit: '', price: priceFor(p) });
    else updateRow(i, { unit: 'pack', price: p.packPrice });
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
    // إعادة تسعير الأصناف الموجودة حسب نوع العميل (نقدي = سعر البيع · تاجر جملة = السعر المبدائي)
    if (c) {
      setRows((prev) =>
        prev.map((r) => {
          if (r.unit === 'pack') return r;
          const p = products.find((x) => String(x.code) === String(r.code));
          return p ? { ...r, price: priceFor(p, name) } : r;
        })
      );
    }
  }

  async function save(andPrint) {
    const items = rows
      .filter((r) => (r.code || r.name) && Number(r.qty) > 0)
      .map((r) => {
        const p = products.find((x) => String(x.code) === String(r.code));
        const isPack = r.unit === 'pack' && p && Number(p.packQty) > 0;
        return {
          code: r.code,
          name: isPack ? `${r.name} (${p.packName || 'عبوة'})` : r.name,
          qty: Number(r.qty) || 0,
          stockQty: isPack ? (Number(r.qty) || 0) * Number(p.packQty) : Number(r.qty) || 0,
          unit: isPack ? 'pack' : '',
          price: Number(r.price) || 0,
          disc: Number(r.disc) || 0,
          notes: r.notes || '',
          total: lineTotal(r),
        };
      });
    if (!items.length && !debtAdd) { showToast('⚠️ أضف صنف واحد على الأقل'); return; }

    // تحذير: أصناف باعت تحت الحد الأدنى — تأكيد قبل الحفظ
    const under = rows.filter((r) => (r.code || r.name) && Number(r.qty) > 0 && belowMin(r));
    if (under.length) {
      warnBeep();
      const lines = under.map((r) => `• ${r.name}: بسعر ${num(r.price, ar)} (الحد الأدنى ${num(minPriceOf(r), ar)})`).join('\n');
      const okUnder = await confirmBox({
        title: '⚠️ بيع تحت الحد الأدنى', danger: true, icon: '🔻',
        message: `فيه ${under.length} صنف بسعر أقل من الحد الأدنى للبيع:\n${lines}\n\nتأكيد البيع بالأسعار دي؟`,
        confirmText: 'أيوة، أكمل البيع',
      });
      if (!okUnder) return;
    }

    // فحص حد الائتمان قبل البيع الآجل
    if (remaining > 0 && customerName) {
      const c = customers.find((x) => x.name === customerName);
      const limit = Number(c?.creditLimit) || 0;
      const newDebt = (prevDebt - debtAdd) + remaining;
      if (limit > 0 && newDebt > limit) {
        if (role === 'admin') {
          if (!(await confirmBox({ title: '⚠️ تجاوز حد الائتمان', danger: true, message: `حد العميل: ${limit}\nمديونيته هتوصل: ${newDebt.toFixed(2)}\n\nتكمل على مسئوليتك؟`, confirmText: 'كمّل' }))) return;
        } else {
          const pass = await promptBox({
            title: '⛔ تجاوز حد الائتمان', icon: '🔐', password: true, placeholder: 'كلمة سر الأدمن',
            message: `العميل هيتجاوز حد الائتمان (${limit} — هيوصل ${newDebt.toFixed(2)})\nمحتاج موافقة الأدمن للمتابعة`,
          });
          if (pass !== settings.adminPassword) { showToast('⛔ اتلغت — تجاوز حد الائتمان'); return; }
        }
      }
    }

    if (customerName && !customers.find((c) => c.name === customerName)) {
      saveCustomer({ name: customerName, phone: customerPhone, address: '' });
    } else if (customerName && customerPhone) {
      const c = customers.find((x) => x.name === customerName);
      if (c && !c.phone) saveCustomer({ ...c, phone: customerPhone });
    }

    // تعديل فاتورة محفوظة: بنحدّث نفس الفاتورة (المخزون بيتظبط بفرق التعديل تلقائياً)
    if (editingInv) {
      const inv = updateInvoice({
        ...editingInv,
        payment,
        rep: rep.trim(),
        repStatus: rep.trim() ? (editingInv.repStatus || 'مع المندوب') : '',
        customer: {
          ...editingInv.customer,
          name: customerName || 'عميل نقدي',
          phone: customerPhone,
          address: customers.find((c) => c.name === customerName)?.address || editingInv.customer?.address || '',
        },
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
      localStorage.removeItem(DRAFT_KEY);
      setSaved(inv);
      setProducts(listProducts());
      showToast(`✅ اتحفظ التعديل على الفاتورة رقم ${inv.number}`);
      if (andPrint) router.push(`/print/${inv.id}?auto=1`);
      return;
    }

    const inv = saveInvoice({
      number,
      date: todayISO(),
      type: 'بيع',
      payment,
      cashier: getCashierName(), // مين عمل الفاتورة
      rep: rep.trim(),
      repStatus: rep.trim() ? 'مع المندوب' : '',
      customer: {
        name: customerName || 'عميل نقدي',
        phone: customerPhone,
        number: Math.max(1, customers.findIndex((c) => c.name === customerName) + 1),
        address: customers.find((c) => c.name === customerName)?.address || '',
      },
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
    localStorage.removeItem(DRAFT_KEY); // الفاتورة اتحفظت رسمي — المسودة خلصت
    setSaved(inv);
    setProducts(listProducts());
    setCustomers(listCustomers());
    showToast(`✅ تم حفظ الفاتورة رقم ${inv.number}`);

    // إشعار الأدمن بالفواتير الكبيرة
    if (net >= (Number(settings.alerts?.bigInvoice) || Infinity)) {
      notifyAdmin(`🧾 فاتورة كبيرة رقم ${inv.number} بقيمة ${net.toFixed(2)} ${settings.currency} للعميل ${inv.customer.name}`);
    }

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
    localStorage.removeItem(DRAFT_KEY);
    setRows([emptyRow()]);
    setCustomerName('');
    setCustomerPhone('');
    setExtraDisc(0);
    setPaid('');
    setPayment('نقدي');
    setSaved(null);
    setRep('');
    setReps(listReps());
    setPrevDebt(0);
    setIncludeDebt(false);
    setEditingInv(null);
    setNavPos({ pos: 0, total: 0 });
    setNumber(nextInvoiceNumber());
    focusCell(0, 'code');
  }

  // فتح فاتورة محفوظة جوه شاشة البيع نفسها — تقراها وتضيف عليها وتعدلها عادي زي البرنامج القديم
  function loadInvoice(inv, pos, total) {
    const its = (inv.items || []).map((it) => {
      const p = products.find((x) => String(x.code) === String(it.code));
      const unit = it.unit || '';
      return {
        code: it.code,
        // صنف العبوة بيتخزن باسم فيه (كرتونة/دستة) — بنرجع الاسم الأصلي في الشاشة
        name: unit === 'pack' && p ? p.name : it.name,
        qty: it.qty,
        price: it.price,
        disc: it.disc || 0,
        notes: it.notes || '',
        unit,
      };
    });
    const lineD = its.reduce((s, r) => s + (Number(r.disc) || 0), 0);
    editLoadRef.current = true;
    setEditingInv(inv);
    setNavPos({ pos, total });
    setSaved(null);
    setRows([...its, emptyRow()]);
    setNumber(inv.number);
    setPayment(inv.payment || 'نقدي');
    setCustomerName(inv.customer?.name === 'عميل نقدي' ? '' : inv.customer?.name || '');
    setCustomerPhone(inv.customer?.phone || '');
    setRep(inv.rep || '');
    setExtraDisc(Math.max(0, (Number(inv.totals?.discount) || 0) - lineD));
    setPaid(String(inv.totals?.paid ?? ''));
    setPrevDebt(Number(inv.totals?.prevBalance) || 0);
    setIncludeDebt((Number(inv.totals?.prevBalance) || 0) > 0);
    showToast(`📖 فتحنا الفاتورة رقم ${inv.number} — اقراها وعدّل عليها براحتك`);
  }

  // التنقل بين الفواتير بالأسهم — الفاتورة بتتفتح هنا في الشاشة نفسها
  function gotoInvoice(dir) {
    const all = listInvoices().slice().sort((a, b) => (a.number || 0) - (b.number || 0));
    if (!all.length) { showToast('مفيش فواتير محفوظة بعد'); return; }
    // لو مش فاتحين فاتورة قديمة يبقى إحنا "بعد" آخر فاتورة (فاتورة جديدة)
    const idx = editingInv ? all.findIndex((x) => x.id === editingInv.id) : all.length;
    let t;
    if (dir === 'first') t = 0;
    else if (dir === 'last') t = all.length - 1;
    else if (dir === 'prev') t = Math.max(0, idx - 1);
    else t = idx + 1;
    if (t >= all.length) {
      // عدّينا آخر فاتورة = نرجع لفاتورة جديدة
      if (editingInv) newInvoice();
      else showToast('انت بالفعل في فاتورة جديدة');
      return;
    }
    loadInvoice(all[t], t + 1, all.length);
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

      {/* شريط التنقل بين الفواتير — الفاتورة بتتفتح هنا في الشاشة: تقراها وتضيف عليها وتعدلها */}
      <div className="inv-nav">
        <span>📁 تصفّح الفواتير:</span>
        <button title="أول فاتورة" onClick={() => gotoInvoice('first')}>⏮</button>
        <button title="الفاتورة السابقة" onClick={() => gotoInvoice('prev')}>◀ السابقة</button>
        {editingInv && navPos.total > 0 && (
          <b style={{ minWidth: 54, textAlign: 'center' }}>{num(navPos.pos, ar)} / {num(navPos.total, ar)}</b>
        )}
        <button title="الفاتورة التالية" onClick={() => gotoInvoice('next')}>التالية ▶</button>
        <button title="آخر فاتورة" onClick={() => gotoInvoice('last')}>⏭ آخر فاتورة</button>
        <button className="btn-accent" title="فاتورة جديدة" onClick={newInvoice}>➕ جديدة</button>
      </div>

      {editingInv && (
        <div className="debt-alert ok" style={{ marginBottom: 10 }}>
          ✏️ فاتحين الفاتورة المحفوظة رقم <b>{num(number, ar)}</b> بتاريخ {fmtDate(editingInv.date, ar)} —
          اقراها واتنقل بالأسهم، أو ضيف أصناف وعدّل عادي والحفظ هيحدّث نفس الفاتورة.
          <button className="btn-sm" onClick={newInvoice}>➕ فاتورة جديدة</button>
        </div>
      )}

      <div className="pos-wrap">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="grid cols-4" style={{ marginBottom: 12 }}>
            <label className="field">
              <span>رقم الفاتورة</span>
              <input value={number} readOnly={!!editingInv} onChange={(e) => setNumber(Number(e.target.value) || number)} />
            </label>
            <label className="field">
              <span>التاريخ</span>
              <input value={fmtDate(editingInv?.date || todayISO(), ar)} readOnly />
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
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 8 }}>
            <label className="field">
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
            <label className="field">
              <span>🛵 المندوب (لو الفاتورة هتطلع للتوصيل)</span>
              <input
                list="reps-list"
                value={rep}
                onChange={(e) => setRep(e.target.value)}
                placeholder="بدون مندوب"
              />
              <datalist id="reps-list">
                {reps.map((r) => <option key={r} value={r} />)}
              </datalist>
            </label>
          </div>

          {prevDebt > 0 && !saved && !editingInv && (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ flex: 1 }}>
                          <ProductPicker
                            dataR={i} dataC="name"
                            value={r.name}
                            products={products}
                            arabicDigits={ar}
                            sortMode={settings.suggestSort}
                            onType={(v) => updateRow(i, { name: v })}
                            onSelect={(p) => { updateRow(i, { code: p.code, name: p.name, price: priceFor(p), unit: '' }); focusCell(i, 'qty'); }}
                            onNavKey={(e) => onKey(e, i, 'name')}
                          />
                        </div>
                        {(() => {
                          const p = products.find((x) => String(x.code) === String(r.code));
                          if (!p || !(Number(p.packQty) > 0) || !(Number(p.packPrice) > 0)) return null;
                          return (
                            <button
                              type="button" tabIndex={-1}
                              className={`btn-sm ${r.unit === 'pack' ? 'btn-accent' : ''}`}
                              title={`${p.packName || 'عبوة'} = ${p.packQty} قطعة`}
                              onClick={() => toggleUnit(i, r)}
                            >
                              {r.unit === 'pack' ? `📦 ${p.packName || 'عبوة'}` : 'قطعة'}
                            </button>
                          );
                        })()}
                      </div>
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
                        className={`num ${belowMin(r) ? 'price-below-min' : ''}`}
                        type="number" min="0" step="any"
                        data-r={i} data-c="price"
                        value={r.price}
                        readOnly={!canPrice}
                        title={belowMin(r) ? `⚠️ أقل من الحد الأدنى (${num(minPriceOf(r), ar)})` : ''}
                        onChange={(e) => onPriceChange(i, e.target.value)}
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={() => {
                if (isMobile) setScanning(true);
                else showToast('📷 الكاميرا دي للموبايل — على الكمبيوتر استخدم سكانر الباركود (USB أو بلوتوث): امسك الصنف والسكانر هيضيفه لوحده');
              }}
            >
              📷 مسح بالكاميرا {!isMobile && '(للموبايل)'}
            </button>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              💡 اكتب الكود أو الاسم وهتظهر الاقتراحات — Enter بينقلك بين الخانات — أو <b>امسح الباركود بسكانر الجهاز</b> (USB/بلوتوث) والصنف هيتضاف لوحده.
              <br />⌨️ اختصارات: <b>F2</b> فاتورة جديدة · <b>F3</b> ركّز على الصنف · <b>F4</b> حفظ وطباعة.
            </p>
          </div>
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
                <button className="btn-accent" style={{ justifyContent: 'center', fontSize: 16, padding: '12px' }} onClick={() => save(true)}>
                  {editingInv ? '💾 حفظ التعديلات وطباعة' : '🖨️ طباعة الفاتورة'}
                </button>
                {editingInv && (
                  <button className="btn-green" style={{ justifyContent: 'center' }} onClick={() => save(false)}>
                    💾 حفظ التعديلات بس
                  </button>
                )}
                <p className="muted" style={{ textAlign: 'center', fontSize: 11, margin: 0 }}>
                  ✅ الفاتورة بتتحفظ تلقائياً — حتى لو النور قطع
                </p>
              </>
            ) : (
              <>
                <div className="badge green" style={{ textAlign: 'center', padding: 8 }}>
                  ✅ تم حفظ فاتورة رقم {num(saved.number, ar)}
                </div>
                <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => router.push(`/print/${saved.id}`)}>
                  👁️ معاينة الفاتورة
                </button>
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

      {scanning && <BarcodeScanner onScan={addByScan} onClose={() => setScanning(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
