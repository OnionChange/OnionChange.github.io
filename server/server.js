import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function buildTransport() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 2525);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Force IPv4 to avoid ::1/IPv6 issues on Windows
    family: 4,
    // Optional SNI to match sandbox hosts
    tls: { servername: host }
  });
}

app.post('/api/send-review', async (req, res) => {
  const { request_id, amount_rub, name, date, text } = req.body || {};
  if (!request_id || !amount_rub || !name || !date || !text) {
    return res.status(400).json({ error: 'Заполнены не все поля' });
  }

  // Always log locally (админ сможет посмотреть server/inbox.log)
  try {
    fs.appendFileSync(
      path.join(__dirname, 'inbox.log'),
      `\n--- ${new Date().toISOString()} ---\n${request_id} | ${amount_rub} | ${name} | ${date}\n${text}\n`
    );
  } catch (e) {
    console.error('LOG_WRITE_FAIL', e);
  }

  // Try to email; if fails — don't break UX
  try {
    const transporter = buildTransport();
    if (transporter) {
      const html = `<h3>Новый отзыв с сайта OnionChange</h3>
        <p><b>Номер заявки:</b> ${request_id}</p>
        <p><b>Сумма (₽):</b> ${amount_rub}</p>
        <p><b>Имя:</b> ${name}</p>
        <p><b>Дата обмена:</b> ${date}</p>
        <p><b>Текст:</b><br/>${String(text).replace(/\n/g,'<br/>')}</p>`;
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: process.env.MAIL_TO || process.env.SMTP_USER,
        subject: 'OnionChange: новый отзыв',
        html
      });
    } else {
      console.warn('SMTP is not configured; skipped email sending');
    }
  } catch (e) {
    console.error('MAIL_FAIL', e?.code || e);
  }

  return res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OnionChange site running on http://localhost:${PORT}`);
  console.log('SMTP check:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    user: process.env.SMTP_USER ? 'set' : 'missing',
    to: process.env.MAIL_TO || process.env.SMTP_USER
  });
});
