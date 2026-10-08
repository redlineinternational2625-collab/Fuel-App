// ============================================================
//  scan-receipt — Supabase Edge Function
//  Reads a fuel receipt photo with Gemini and returns the numbers.
//  Deploy: Supabase > Edge Functions > Deploy a new function > name it
//  exactly  scan-receipt  > paste this file > Deploy.
//  Then: Edge Functions > Secrets > add  GEMINI_API_KEY  (from aistudio.google.com)
// ============================================================

const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

const PROMPT =
  "You are reading a photo of a fuel purchase receipt from a gas station, truck stop, or cardlock. " +
  "Return ONLY a JSON object with exactly these keys: " +
  '{"vendor": station name or null, "address": full street address of the station as printed (street, city, state) or null, ' +
  '"date": "YYYY-MM-DD" or null, "time": time of purchase as printed (e.g. "2:41 PM") or null, ' +
  '"items": [{"product": "Diesel" | "Gas" | "DEF" | "Other", "gallons": number or null, "price_per_gallon": number or null, "total": number or null}], ' +
  '"grand_total": number or null}. ' +
  "Rules: DEF means diesel exhaust fluid. Diesel includes #2, dyed, off-road, clear, and premium diesel. " +
  "Gas means unleaded/regular/premium gasoline. Gallons often have 3 decimals. Use null for anything not clearly visible. Do not guess.";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ ok: false, error: "GEMINI_API_KEY secret is not set in Supabase" });

  let image = "", mime = "image/jpeg";
  try {
    const body = await req.json();
    image = String(body.image || "");
    mime = String(body.mime || "image/jpeg");
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  if (!image) return json({ ok: false, error: "no image" }, 400);

  let lastErr = "";
  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
          generationConfig: { temperature: 0, response_mime_type: "application/json" },
        }),
      });
      if (res.status === 404) { lastErr = `model not available: ${model}`; continue; }
      if (!res.ok) {
        lastErr = `Gemini error ${res.status}: ${(await res.text()).slice(0, 160)}`;
        if (res.status === 429 || res.status === 503) continue;
        break;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: { text?: string }) => p.text ?? "").join("").replace(/```json|```/g, "").trim();
      return json({ ok: true, fields: JSON.parse(text), model });
    } catch (e) {
      lastErr = `parse error: ${String(e)}`;
    }
  }
  return json({ ok: false, error: lastErr || "Gemini failed" });
});
