import crypto from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function isValidTelegramLogin(data) {
  const { hash, ...fields } = data;
  const checkString = Object.keys(fields)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join("\n");

  const secret = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  return hmac === hash;
}

export default async function handler(req, res) {
  try {
    const data = req.method === "POST" ? req.body : req.query;
    if (!isValidTelegramLogin(data)) {
      return res.status(403).send("Invalid signature");
    }

    // достаём данные из телеги
    const tgId = data.id;
    const firstName = data.first_name || "";
    const username = data.username || "";

    // пишем сессию в cookie на 7 дней
    const payload = Buffer.from(JSON.stringify({ tgId, firstName, username })).toString("base64");
    res.setHeader("Set-Cookie", `arendator_session=${payload}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`);

    // редиректим обратно на главную
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (err) {
    res.status(500).send("Server error");
  }
}

