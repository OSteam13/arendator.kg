// /api/send-mail.js
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  try {
    // Разрешим быстрый тест через GET ?to=&subject=&text=
    const { method } = req;

    const to =
      (method === 'GET' ? req.query.to : req.body?.to) ||
      process.env.SMTP_FROM; // на всякий случай отправим себе

    const subject =
      (method === 'GET' ? req.query.subject : req.body?.subject) || 'Тест';

    const html =
      (method === 'GET' ? req.query.html : req.body?.html) ||
      `<p>Привет! Это тестовое письмо с Vercel + Brevo SMTP.</p>`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,        // smtp-relay.brevo.com
      port: Number(process.env.SMTP_PORT),// 587
      secure: false,                      // для 587 — false
      requireTLS: true,                   // принудительно TLS
      auth: {
        user: process.env.SMTP_USER,      // 95e4...@smtp-brevo.com
        pass: process.env.SMTP_PASS,      // мастер-ключ из Brevo
      },
    });

    await transporter.sendMail({
      from: `"Arendator.kg" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
