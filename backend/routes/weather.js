import { Router } from "express";

const router = Router();

// 3.2 — Passive context: keyless weather lookup (Open-Meteo) so clients can
// enrich situational.weather without exposing an API key or asking the user.
const WMO_TO_WEATHER = (code) => {
  if ([61, 63, 65, 80, 81, 82, 51, 53, 55, 95, 96, 99].includes(code)) return "rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "cold";
  if ([0, 1].includes(code)) return "sunny";
  return "any";
};

// GET /api/weather?lat=&lon=
router.get("/", async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "lat and lon are required" });

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Open-Meteo error: ${response.status}`);

    const data = await response.json();
    const code = data?.current?.weather_code;
    const tempC = data?.current?.temperature_2m;
    const weather = tempC != null && tempC >= 30 ? "hot" : WMO_TO_WEATHER(code);

    return res.json({ success: true, weather, temperature_c: tempC ?? null });
  } catch (err) {
    console.warn("GET /weather error:", err.message);
    return res.status(200).json({ success: false, weather: "any", temperature_c: null });
  }
});

export default router;
