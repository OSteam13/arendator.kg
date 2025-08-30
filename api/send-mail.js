// /api/send-mail.js  (вариант без reCAPTCHA)
import nodemailer from 'nodemailer';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Разрешаем отправку ТОЛЬКО на эти адреса (чтобы не стать open relay)
const ALLOWED_RECIPIENTS = new Set([
  'reply@arendator.kg',
  'oskarfunky13@gmail.com', // при желании оставьте себе для тестов
]);

// Памятка по лимитам
const WINDOW = Number(process.env.RATE_LIMIT_WINDOW || 60); // сек
const MAX = Number(process.env.RATE_LIMIT_MAX || 20);       // запросов/IP
const bucketByIp = new Map();

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // CORS + Referer
  const origin = req.headers.origin;
  const referer = req.headers.referer || '';
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.some(o => referer.startsWith(o))) {
    return res.status(403).json({ ok: false, error: 'Bad referer' });
  }

  // Rate limit по IP
  const ip = getIp(req);
  const now = Date.now();
  const arr = (bucketByIp.get(ip) || []).filter(ts => now - ts < WINDOW * 1000);
  if (arr.length >= MAX) {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }
  arr.push(now);
  bucketByIp.set(ip, arr);

  // Получаем данные
  const { to, name, email, message, ts, website } = req.body || {};

  // Honeypot: бот обычно заполнит скрытое поле
  if (website) return res.status(400).json({ ok: false, error: 'Spam detected' });

  // Минимальное время заполнения
  const minFillMs = 3000; // 3 сек
  const clientTs = Number(ts || 0);
  if (!clientTs || now - clientTs < minFillMs) {
    return res.status(400).json({ ok: false, error: 'Too fast' });
  }

  // Валидируем поля
  const safeName = String(name || '').trim().slice(0, 100);
  const fromEmail = String(email || '').trim();
  const msgHtml = String(message || '').trim();
  if (!validEmail(fromEmail)) {
    return res.status(400).json({ ok: false, error: 'Invalid email' });
  }
  if (!msgHtml || msgHtml.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Invalid message' });
  }

  // Разрешённые получатели
  const recipient = String(to || 'reply@arendator.kg').toLowerCase();
  if (!ALLOWED_RECIPIENTS.has(recipient)) {
    return res.status(403).json({ ok: false, error: 'Recipient not allowed' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,       // 587
      requireTLS: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    // Явная проверка соединения (вернёт понятную ошибку, если SMTP ещё не активировали)
    await transporter.verify();

    await transporter.sendMail({
      from: `"Arendator" <${process.env.SMTP_FROM}>`,
      to: recipient,
      subject: `Сообщение с сайта от ${safeName || 'гость'} <${fromEmail}>`,
      replyTo: fromEmail, // удобно ответить пользователю
      html: msgHtml,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
