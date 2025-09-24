// runtime: node (Vercel/Next API)
export const config = { runtime: "nodejs" };

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  // НУЖЕН service_role ключ!
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── Утилиты ────────────────────────────────────────────────────────────────
function normalizePhoneAny(s = "") {
  let d = (s + "").replace(/\D+/g, "");
  if (!d) return "";
  // Kyrgyzstan
  if (d.startsWith("996") && d.length >= 4 && d[3] === "0") d = d.slice(0, 3) + d.slice(4);
  if (d.startsWith("996")) return "+" + d;
  if (d.startsWith("0") && d.length >= 10) return "+996" + d.slice(-9);
  if (d.length >= 9 && d.length <= 12 && !d.startsWith("996")) return "+996" + d.slice(-9);
  return "+" + d;
}

function makeDedupeKey({ firstPhoto = "", phone = "", price = "", district = "", title = "" }) {
  const basis = [
    (firstPhoto || "").toLowerCase().trim(),
    (phone || "").replace(/\s+/g, ""),
    price || "",
    (district || "").toLowerCase().trim(),
    (title || "").toLowerCase().trim(),
  ].join("|");
  return crypto.createHash("sha1").update(basis).digest("hex"); // 40 символов
}

// ─── Эндпоинт ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  try {
    const {
      title = "Объявление",
      photos = [],
      price = null,
      district = "",
      phone_full = "",
      source = "tg",
      source_post_id = "",     // если есть — идеальный ключ
      description = "",
      owner_tg_id = null,
      price_text = ""
    } = req.body || {};

    // Нормализуем телефон (ловит все «человеческие» форматы)
    const phone = normalizePhoneAny(phone_full);

    // Считаем dedupe_key (на случай отсутствия source_post_id)
    const firstPhoto = Array.isArray(photos) && photos.length ? photos[0] : "";
    const dedupe_key = makeDedupeKey({ firstPhoto, phone, price, district, title });

    const row = {
      title: String(title).slice(0, 200),
      photos,
      price,
      price_text,
      district,
      description: description || "",
      phone_full: phone,
      source: source || "tg",
      source_post_id: source_post_id || null,
      dedupe_key,                     // важно: сохраняем!
      approved: true,
      owner_tg_id
    };

    // Если пришёл стабильный исходный ID — upsert по (source, source_post_id)
    if (row.source_post_id) {
      const { data, error } = await supabase
        .from("listings")
        .upsert([row], { onConflict: "source,source_post_id" })
        .select()
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json({ ok: true, id: data?.id || null });
    }

    // Иначе — upsert по (source, dedupe_key)
    const { data, error } = await supabase
      .from("listings")
      .upsert([row], { onConflict: "source,dedupe_key" })
      .select()
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (e) {
    console.error("[ingest] error:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
