// api/tg-login.js
// Проверяет подпись Telegram Login Widget и возвращает мини-HTML,
// который отправляет результат в родительское окно через postMessage.

import crypto from "crypto";

export default function handler(req, res) {
  try {
    // Telegram всегда шлёт GET с query-параметрами
    const query = req.query || {};
    const { hash, ...data } = query;

    if (!hash) {
      return res.status(400).send("Missing hash");
    }

    const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).send("BOT_TOKEN is not set");
    }

    // 1) secret = sha256(bot_token)
    const secret = crypto.createHash("sha256").update(BOT_TOKEN).digest();

    // 2) checkString = сортированные по ключу пары k=v, кроме hash, соединённые \n
    const checkString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("\n");

    // 3) hmac = HMAC-SHA256(checkString, secret) -> hex
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

    // 4) Сравнение
    if (hmac !== hash) {
      return res
        .status(403)
        .send(`<!doctype html>
<meta charset="utf-8">
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({type:'tg-auth', ok:false, err:'invalid-signature'}, '*');
    }
  } catch(_) {}
  window.close();
  setTimeout(function(){ location.replace('/'); }, 1200);
</script>
Подпись недействительна.`);
    }

    // Всё ок: берём безопасный минимум данных пользователя
    const safeUser = {
      id: data.id,
      first_name: data.first_name || "",
      username: data.username || "",
      photo_url: data.photo_url || ""
    };

    // Кука на сутки (необязательно, можно удалить)
    res.setHeader("Set-Cookie", "auth=1; Path=/; Max-Age=86400; SameSite=Lax; Secure");

    // Возвращаем мини-страницу, которая сообщит в родителя и закроется.
    // ВАЖНО: экранируем "<", чтобы не ломать HTML.
    const safeJson = JSON.stringify(safeUser).replace(/</g, "\\u003c");

    return res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<script>
  (function(){
    try {
      if (window.opener) {
        window.opener.postMessage({ type:'tg-auth', ok:true, user: ${safeJson} }, '*');
      }
    } catch (e) {}
    window.close();
    setTimeout(function(){ location.replace('/'); }, 1200);
  })();
</script>
Успешно. Окно закроется автоматически.`);
  } catch (e) {
    return res.status(500).send("Server error");
  }
}
