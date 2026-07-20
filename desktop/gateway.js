// بوابة الواتساب مدمجة جوه برنامج الديسكتوب — بتشتغل لوحدها مع فتح البرنامج
// تسجيل دخول QR + طابور إرسال بنظام الحماية من الحظر
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');

const PORT = 3900;
const TOKEN = 'saqqa-secret';
const MIN_DELAY = 25; // ثواني بين الرسائل (عشوائي من-إلى)
const MAX_DELAY = 70;
const DAILY_CAP = 150;
const HOUR_START = 9;
const HOUR_END = 22;

module.exports = function startGateway(authDir) {
  // مكتبة baileys بقت ES Module — لازم dynamic import (النسخة اللي جوه Electron مبتقبلش require ليها)
  let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;
  async function loadBaileys() {
    if (makeWASocket) return;
    const b = await import('@whiskeysockets/baileys');
    const m = b.default && b.default.useMultiFileAuthState ? b.default : b;
    makeWASocket = (typeof m.default === 'function' && m.default) || m.makeWASocket || b.default;
    useMultiFileAuthState = m.useMultiFileAuthState;
    DisconnectReason = m.DisconnectReason;
    fetchLatestBaileysVersion = m.fetchLatestBaileysVersion;
  }

  const logger = pino({ level: 'silent' });
  const app = express();
  // كروم بيبعت فحص "شبكة خاصة" قبل ما الموقع يكلم localhost — لازم نرد بالموافقة دي
  app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });
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
    if ((req.headers.authorization || '') === `Bearer ${TOKEN}`) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  async function startSock() {
    await loadBaileys();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
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
      }
      if (connection === 'close') {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) setTimeout(startSock, 5000);
      }
    });
  }

  const withinHours = () => {
    const h = new Date().getHours();
    return h >= HOUR_START && h < HOUR_END;
  };
  const resetDaily = () => {
    const t = new Date().toDateString();
    if (t !== sentDate) { sentDate = t; sentToday = 0; }
  };
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a));

  async function worker() {
    if (working) return;
    working = true;
    while (queue.length) {
      resetDaily();
      if (!connected) break;
      if (!withinHours()) { setTimeout(worker, 10 * 60 * 1000); working = false; return; }
      if (sentToday >= DAILY_CAP) { setTimeout(worker, 60 * 60 * 1000); working = false; return; }
      const job = queue.shift();
      try {
        const check = await sock.onWhatsApp(job.phone);
        if (!check || !check.length || !check[0].exists) continue;
        const jid = check[0].jid || job.phone + '@s.whatsapp.net';
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise((r) => setTimeout(r, rand(2000, 6000)));
        await sock.sendMessage(jid, { text: job.message });
        sentToday++;
      } catch {
        job.retries = (job.retries || 0) + 1;
        if (job.retries < 3) queue.push(job);
      }
      if (queue.length) await new Promise((r) => setTimeout(r, rand(MIN_DELAY * 1000, MAX_DELAY * 1000)));
    }
    working = false;
  }

  app.get('/status', (req, res) => {
    resetDaily();
    res.json({ connected, me: meNumber, queue: queue.length, sentToday, dailyCap: DAILY_CAP, hours: `${HOUR_START}-${HOUR_END}` });
  });

  app.get('/qr', async (req, res) => {
    if (connected) return res.json({ connected: true });
    if (!lastQr) return res.json({ qr: '' });
    res.json({ qr: await QRCode.toDataURL(lastQr, { width: 300 }) });
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
    try { await sock?.logout(); } catch {}
    connected = false;
    res.json({ ok: true });
  });

  const server = app.listen(PORT, '127.0.0.1', () => {
    startSock().catch((e) => console.log('baileys start failed:', e.message));
  });
  // لو برنامج تاني (محاسب/أدمن) فاتح البوابة قبلنا على نفس الجهاز — عادي، هنستخدم بتاعته
  server.on('error', () => {});
};
