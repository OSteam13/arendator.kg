// /api/tg-login.js
// Vercel serverless (Node 18+). Проверяет подпись Telegram Login Widget
// и возвращает мини-страницу, которая сообщает во "вкладку-родителя",
// что авторизация прошла успешно.

import crypto from "crypto";

export default function handler(req, res) {
  try {
    // Telegram всегда приходит сюда GET-запросом с query-параметрами
    const query = req.query || {};
    const { hash, ...data } = query;

    if (!hash) {
      return res.status(400).send("Missing hash");
    }

    // Токен бота должен быть в окружении Vercel → Settings → Environment Variables
    // допускаем оба названия
    const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).send("BOT_TOKEN is not set");
    }

    // 1) Готовим секрет = sha256(bot_token)
    const secret = crypto.createHash("sha256").update(BOT_TOKEN).digest();

    // 2) Собираем checkString из всех параметров КРОМЕ hash, отсортированных по ключу
    const checkString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("\n");

    // 3) Считаем HMAC-SHA256(checkString, secret)
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

    // 4) Сравниваем с hash
    if (hmac !== hash) {
      return res.status(403).send("Invalid signature");
    }

    // Всё ок — можно считать пользователя валидным
    // Соберём "безопасный" срез полей (ровно то, что пригодится на клиенте)
    const safeUser = {
      id: data.id,
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      username: data.username || "",
      photo_url: data.photo_url || "",
    };

    // По желанию — поставим лёгкую куку "auth" на сутки (не обязательно)
    res.setHeader(
      "Set-Cookie",
      "auth=1; Path=/; Max-Age=86400; SameSite=Lax; Secure"
    );

    // ВАЖНО: возвращаем мини-HTML, который сообщит в основное окно (родителя),
    // что авторизация прошла, и передаст user. Затем попытается закрыть вкладку.
    const html = `<!doctype html>
<meta charset="utf-8">
<title>Telegram auth</title>
<script>
(function () {
  try {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'tg-auth', ok: true, user: ${JSON.stringify(safeUser)} },
        '*'
      );
    }
  } catch (e) {}
  // закрыть текущую вкладку/попап
  window.close();
  // на крайний случай, если закрыть нельзя — вернём на главную
  setTimeout(function(){ location.replace('/'); }, 1200);
})();
</script>
Успешно. Окно закроется автоматически.`;

    return res.status(200).send(html);
  } catch (err) {
    console.error("tg-login error:", err);
    return res.status(500).send("Server error");
  }
}
