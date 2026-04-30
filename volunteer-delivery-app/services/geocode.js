// Helper to translate an address into { latitude, longitude }.
// It prefers expo-location and falls back to a direct Nominatim lookup.

import * as Location from "expo-location";

export async function lookupAddress(address) {
  if (!address) return null;
  const normalizedAddress = String(address).trim();
  if (!normalizedAddress) return null;

  const remoteGeocode = async () => {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(normalizedAddress);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "VolunteerDeliveryApp/1.0 (your-email@example.com)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) {
      console.error("remote geocode lookup failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    const { lat, lon } = data[0];
    return {
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
    };
  };

  try {
    try {
      const results = await Location.geocodeAsync(normalizedAddress);
      if (Array.isArray(results) && results.length > 0) {
        const { latitude, longitude } = results[0];
        if (latitude != null && longitude != null) {
          return { latitude, longitude };
        }
      }
      console.warn("expo-location geocode returned no results, falling back to remote geocode", normalizedAddress);
    } catch (nativeError) {
      console.warn("expo-location geocode failed, falling back to remote geocode", nativeError);
    }

    const remoteResult = await remoteGeocode();
    if (remoteResult) {
      return remoteResult;
    }

    console.error("geocode lookup failed: no results for", normalizedAddress);
    return null;
  } catch (e) {
    console.error("lookupAddress error", e);
    return null;
  }
}
