// simple API route that takes an `address` query parameter and returns
// latitude/longitude using Nominatim (OpenStreetMap) geocoding.
//
// You can call this from the app or from any server-side code. For example:
//
//   const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
//   const { latitude, longitude } = await res.json();
//
// Then store the coords alongside the order in Supabase so you don't have to
// geocode repeatedly on the client.

export default async function handler(req, res) {
  try {
    const { address } = req.query || {};
    if (!address) {
      return res.status(400).json({ error: "`address` query parameter required" });
    }

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&q=" +
      encodeURIComponent(address);

    const geoRes = await fetch(url, {
      headers: {
        // Nominatim politely requests a user agent
        "User-Agent": "VolunteerDeliveryApp/1.0 (your-email@example.com)",
      },
    });

    if (!geoRes.ok) {
      return res
        .status(geoRes.status)
        .json({ error: "geocoding service error" });
    }

    const data = await geoRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: "no results" });
    }

    const { lat, lon } = data[0];
    return res.json({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
  } catch (e) {
    console.error("geocode api error", e);
    return res.status(500).json({ error: "internal error" });
  }
}
