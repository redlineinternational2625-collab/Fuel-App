// ============================================================
//  scan-registration — Supabase Edge Function
//  Reads a vehicle registration photo with Gemini and returns the details.
//  Deploy: Supabase > Edge Functions > Deploy a new function > name it
//  exactly  scan-registration  > paste this file > Deploy.
//  It uses the same GEMINI_API_KEY secret as scan-receipt (no new secret needed).
// ============================================================

const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

const PROMPT =
  "You are reading a photo of a US vehicle registration card or certificate (car, truck, trailer, or equipment). " +
  "Return ONLY a JSON object with exactly these keys: " +
  '{"plate": license plate number as printed or null, "state": two-letter state that issued it or null, ' +
  '"vin": vehicle identification number (VIN) as printed or null, "year": model year as a 4-digit number or null, ' +
  '"make": make (e.g. "Ford", "Kenworth", "Mack") or null, "model": model or body style or null, ' +
  '"owner": registered owner name as printed or null, "expires": expiration date as "YYYY-MM-DD" or null, ' +
  '"fuel": "Diesel" | "Gas" | null, "unit": company unit or fleet number if one is printed or null}. ' +
  "Rules: A VIN is usually 17 characters and never contains the letters I, O or Q (read those as 1, 0 and 0). " +
  "Fuel is often a code: D or DSL means Diesel; G or GAS means Gas. " +
  "Use null for anything not clearly visible. Do not guess.";

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
      const f = JSON.parse(text);
      // Tidy up: VINs and plates in capitals with no spaces; fuel normalized to Gas / Diesel
      if (f.vin) f.vin = String(f.vin).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[IOQ]/g, (c: string) => (c === "I" ? "1" : "0"));
      if (f.plate) f.plate = String(f.plate).toUpperCase().replace(/\s+/g, "");
      if (f.state) f.state = String(f.state).toUpperCase().slice(0, 2);
      if (f.fuel) f.fuel = /gas|unleaded|^g$/i.test(String(f.fuel)) ? "Gas" : "Diesel";
      return json({ ok: true, fields: f, model });
    } catch (e) {
      lastErr = `parse error: ${String(e)}`;
    }
  }
  return json({ ok: false, error: lastErr || "Gemini failed" });
});
