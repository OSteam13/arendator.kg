// api/tg-login.js
import crypto from "crypto";

export default function handler(req, res) {
  try {
    const { query } = req;              // GET-параметры от Telegram
    const { hash, ...data } = query;

    // 1) Проверяем подпись
    const token = process.env.BOT_TOKEN;
    if (!token) {
      return res.status(500).send("BOT_TOKEN is not set");
    }

    const secret = crypto.createHash("sha256").update(token).digest();
    const checkString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("\n");

    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
    if (hmac !== hash) {
      return res.status(403).send("Invalid signature");
    }

    // (по желанию можно сохранить user в базе)
    // const user = JSON.parse(data.user); // если нужно

    // 2) Отдаём HTML, который ставит флаг входа и перекидывает на главную
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`
<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Вход через Telegram</title>
</head>
<body style="font-family:system-ui,Arial,sans-serif;padding:20px">
  <p>Успешная авторизация через Telegram. Возврат на сайт…</p>
  <script>
    try {
      // Можно сохранить часть профиля, если нужно:
      ${data.user ? `localStorage.setItem('tg_user', ${JSON.stringify(JSON.stringify(data.user))});` : ''}
      localStorage.setItem('userLogged','1');
    } catch(e) {}
    // Возвращаемся на главную с отметкой
    location.replace('/#tg=ok');
  </script>
</body></html>
    `);
  } catch (e) {
    res.status(500).send("Server error");
  }
}
