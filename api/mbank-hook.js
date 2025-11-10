// api/mbank-hook.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = req.body || {};
    const {
      secret,
      amount,
      currency,
      bank,
      created_at,
      note,
      raw_text,
    } = body;

    if (!secret || secret !== process.env.MACRODROID_SECRET) {
      return res.status(401).json({ ok: false, error: "Bad secret" });
    }

    // простейшая валидация
    const amtStr = amount ? String(amount) : "—";
    const curStr = currency || "KGS";
    const bankStr = bank || "mBank";
    const timeStr = created_at || "—";

    const text =
      "📲 Mbank / MacroDroid\n" +
      `Банк: ${bankStr}\n` +
      `Сумма: ${amtStr} ${curStr}\n` +
      `Время: ${timeStr}\n` +
      (note ? `Комментарий: ${note}\n` : "") +
      (raw_text ? `\n🔎 raw:\n${raw_text}` : "");

    const tgToken = process.env.VIPPAY_BOT_TOKEN;
    const chatId = process.env.VIPPAY_TECH_CHAT_ID;

    if (!tgToken || !chatId) {
      return res
        .status(500)
        .json({ ok: false, error: "Telegram env vars not set" });
    }

    const tgResp = await fetch(
      `https://api.telegram.org/bot${tgToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_notification: true,
        }),
      }
    );

    const tgData = await tgResp.json();
    if (!tgData.ok) {
      console.error("Telegram error:", tgData);
      return res.status(502).json({ ok: false, error: "Telegram error" });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
