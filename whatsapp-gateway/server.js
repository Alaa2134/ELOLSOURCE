// بوابة واتساب لنظام كاشير السقا للأدوات المنزلية
// تسجيل دخول بمسح QR (زي واتساب ويب) + طابور إرسال بنظام حماية من الحظر
//
// التشغيل:  npm install  ثم  npm start
// الإعدادات كلها من متغيرات البيئة (انظر .env.example)

import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

const PORT = Number(process.env.PORT || 3900);
const TOKEN = process.env.WA_TOKEN || 'saqqa-secret';
// ===== إعدادات الحماية من الحظر =====
const MIN_DELAY = Number(process.env.MIN_DELAY_SEC || 25); // أقل تأخير بين رسالتين (ثانية)
const MAX_DELAY = Number(process.env.MAX_DELAY_SEC || 70); // أقصى تأخير
const DAILY_CAP = Number(process.env.DAILY_CAP || 150); // حد أقصى يومي
const HOUR_START = Number(process.env.HOUR_START || 9); // بداية ساعات الإرسال
const HOUR_END = Number(process.env.HOUR_END || 22); // نهاية ساعات الإرسال

const logger = pino({ level: 'warn' });
const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let lastQr = '';
let connected = false;
let meNumber = '';
const queue = [];
let sentToday = 0;
let sentDate = new Date().toDateString();
let working = false;

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (h === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: 'unauthorized' });
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Saqqa POS', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) lastQr = qr;
    if (connection === 'open') {
      connected = true;
      lastQr = '';
      meNumber = (sock.user?.id || '').split(':')[0];
      console.log('✅ واتساب متصل:', meNumber);
    }
    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('⚠️ الاتصال اتقفل، كود:', code);
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startSock, 5000); // إعادة اتصال تلقائي
      } else {
        console.log('🚪 تم تسجيل الخروج — امسح QR جديد');
      }
    }
  });
}

function withinHours() {
  const h = new Date().getHours();
  return h >= HOUR_START && h < HOUR_END;
}

function resetDaily() {
  const today = new Date().toDateString();
  if (today !== sentDate) {
    sentDate = today;
    sentToday = 0;
  }
}

const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

// معالج الطابور: رسالة واحدة كل تأخير عشوائي — محاكاة إرسال يدوي
async function worker() {
  if (working) return;
  working = true;
  while (queue.length) {
    resetDaily();
    if (!connected) break;
    if (!withinHours()) {
      console.log('🌙 خارج ساعات الإرسال — الرسائل مستنية للصبح');
      setTimeout(worker, 10 * 60 * 1000);
      working = false;
      return;
    }
    if (sentToday >= DAILY_CAP) {
      console.log('📊 وصلنا للحد اليومي — الباقي هيتبعت بكرة');
      setTimeout(worker, 60 * 60 * 1000);
      working = false;
      return;
    }
    const job = queue.shift();
    try {
      // فحص إن الرقم على واتساب فعلاً قبل الإرسال (مهم جداً للحماية)
      const jid = job.phone + '@s.whatsapp.net';
      const check = await sock.onWhatsApp(job.phone);
      if (!check || !check.length || !check[0].exists) {
        console.log('⛔ رقم مش على واتساب، اتشال:', job.phone);
        continue;
      }
      // محاكاة "يكتب الآن..." قبل الإرسال
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise((r) => setTimeout(r, rand(2000, 6000)));
      await sock.sendMessage(check[0].jid || jid, { text: job.message });
      sentToday++;
      console.log(`📤 اتبعت لـ ${job.phone} (${sentToday}/${DAILY_CAP} النهارده)`);
    } catch (e) {
      console.log('❌ فشل إرسال:', e.message);
      if (job.retries === undefined) job.retries = 0;
      if (job.retries < 2) {
        job.retries++;
        queue.push(job);
      }
    }
    if (queue.length) {
      await new Promise((r) => setTimeout(r, rand(MIN_DELAY * 1000, MAX_DELAY * 1000)));
    }
  }
  working = false;
}

app.get('/status', (req, res) => {
  resetDaily();
  res.json({
    connected,
    me: meNumber,
    queue: queue.length,
    sentToday,
    dailyCap: DAILY_CAP,
    hours: `${HOUR_START}-${HOUR_END}`,
  });
});

app.get('/qr', async (req, res) => {
  if (connected) return res.json({ connected: true });
  if (!lastQr) return res.json({ qr: '' });
  const dataUrl = await QRCode.toDataURL(lastQr, { width: 300 });
  res.json({ qr: dataUrl });
});

app.post('/send', auth, (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone و message مطلوبين' });
  if (!connected) return res.status(503).json({ error: 'الواتساب غير متصل' });
  queue.push({ phone: String(phone).replace(/[^0-9]/g, ''), message: String(message) });
  worker();
  res.json({ queued: true, position: queue.length });
});

app.post('/logout', auth, async (req, res) => {
  try {
    await sock?.logout();
  } catch {}
  connected = false;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🚀 بوابة واتساب السقا شغالة على http://localhost:${PORT}`);
  console.log(`🛡️ الحماية: تأخير ${MIN_DELAY}-${MAX_DELAY}ث | حد يومي ${DAILY_CAP} | ساعات ${HOUR_START}-${HOUR_END}`);
  startSock();
});
