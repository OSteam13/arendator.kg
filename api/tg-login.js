// /api/tg-login.js
// Vercel serverless (Node 18+). Проверяет подпись Telegram Login Widget
// и возвращает мини-страницу, которая сообщает главному окну об успехе.

import crypto from "crypto";

export default function handler(req, res) {
  try {
    const { query = {} } = req;
    const { hash, ...data } = query;
    if (!hash) return res.status(400).send("Missing hash");

    const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return res.status(500).send("BOT_TOKEN is not set");

    // 1) Секрет
    const secret = crypto.createHash("sha256").update(BOT_TOKEN).digest();
    // 2) checkString
    const checkString = Object.keys(data).sort().map((k)=>`${k}=${data[k]}`).join("\n");
    // 3) HMAC
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
    // 4) Сверка
    if (hmac !== hash) return res.status(403).send("Invalid signature");

    // Успех — подготовим «безопасного» пользователя
    const safeUser = {
      id: data.id,
      first_name: data.first_name,
      username: data.username,
    };

    // Необязательно: кука на сутки
    res.setHeader("Set-Cookie", `auth=1; Path=/; Max-Age=86400; SameSite=Lax; Secure`);

    // Вернём HTML, который отправит сообщение в основное окно и закроет поп-ап
    return res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<script>
  (function(){
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'tg-auth', ok: true, user: ${JSON.stringify(safeUser)} },
          '*'
        );
      }
    } catch (e) {}
    window.close();
    setTimeout(function(){ location.replace('/'); }, 1200);
  })();
</script>
Успешно. Окно закроется автоматически.
`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Server error");
  }
}
