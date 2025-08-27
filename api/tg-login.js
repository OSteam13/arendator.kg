// /api/tg-login.js  — Node 18+ (Vercel serverless)
import crypto from "crypto";

export default function handler(req, res) {
  try {
    const query = req.query || {};
    const { hash, ...data } = query;
    if (!hash) return res.status(400).send("Missing hash");

    // токен бота из env
    const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return res.status(500).send("BOT_TOKEN is not set");

    // проверка подписи Telegram
    const secret = crypto.createHash("sha256").update(BOT_TOKEN).digest();
    const checkString = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join("\n");
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
    if (hmac !== hash) return res.status(403).send("Invalid signature");

    // лёгкий набор данных пользователя
    const safeUser = {
      id: data.id,
      first_name: data.first_name || "",
      username: data.username || ""
    };

    // кука как доп. маркер (на случай открытия в том же табе)
    res.setHeader("Set-Cookie", [
      "auth=1; Path=/; Max-Age=2592000; SameSite=Lax; Secure", // 30 дней
    ]);

    // упакуем user в base64 для безопасной вставки в HTML
    const userB64 = Buffer.from(JSON.stringify(safeUser), "utf8").toString("base64");

    // HTML: если есть opener — postMessage и закрыть; иначе — редирект на /
    const html = `<!doctype html>
<meta charset="utf-8">
<script>
(function(){
  try {
    var user = JSON.parse(atob("${userB64}"));
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "tg-auth", ok: true, user: user }, "*");
      window.close();
      return;
    }
  } catch (e) {}

  // Фоллбэк: если открылись в этом же табе — вернёмся на сайт
  var url = new URL("/", location.origin);
  url.searchParams.set("tg", "ok");
  location.replace(url.href);
})();
</script>
Успешно. Возврат на сайт...
`;

    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send("Server error");
  }
}
