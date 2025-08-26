// api/tg-login.js
// Vercel serverless (Node 18+). Проверяет подпись Telegram Login Widget
// и возвращает мини-страницу, которая ставит флаг входа на клиенте.

import crypto from "crypto";

export default function handler(req, res) {
  try {
    // Telegram всегда дергает наш endpoint GET-запросом с query-параметрами.
    const { query } = req;

    // Телеграм присылает hash + прочие поля (id, first_name, username, photo_url, auth_date, user)
    const { hash, ...data } = query || {};
    if (!hash) {
      return res.status(400).send("Missing hash");
    }

    // Токен бота держим только в окружении (Vercel → Settings → Environment Variables)
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).send("BOT_TOKEN is not set");
    }

    // 1) Готовим secret = sha256(bot_token)
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

    // Если нужна информация о пользователе — обычно приходит поле user (JSON-строка)
    // const user = data.user ? JSON.parse(data.user) : null;

    // Отдаём маленькую HTML-страницу, которая:
    //  - ставит флаг входа в localStorage
    //  - при желании сохраняет user
    //  - возвращает пользователя на главную с якорем #tg=ok
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Вход через Telegram…</title>
</head>
<body style="font-family:system-ui,Arial,sans-serif;padding:20px">
  <p>Успешная авторизация через Telegram. Возврат на сайт…</p>
  <script>
    try {
      localStorage.setItem('userLogged','1');
      ${data.user ? `localStorage.setItem('tg_user', ${JSON.stringify(JSON.stringify(data.user))});` : ""}
    } catch(e) {}
    // назад на главную (index.html обработает #tg=ok и покажет тост)
    location.replace('/#tg=ok');
  </script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send("Server error");
  }
}
