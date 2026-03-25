// helper to translate an address into {latitude, longitude}
// uses the internal `/api/geocode` endpoint so the logic is centralized
// and can be reused when inserting or updating orders.
// it mirrors the logic in `confirm-delivery` to compute the correct host.

import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiBaseUrl() {
  if (Platform.OS === "web") {
    return "";
  }
  const hostString = Constants.manifest?.debuggerHost;
  if (hostString) {
    const host = hostString.split(":")[0];
    return `http://${host}:19000`;
  }
  return "http://localhost:19000";
}

export async function lookupAddress(address) {
  if (!address) return null;
  try {
    const base = getApiBaseUrl();
    const res = await fetch(
      `${base}/api/geocode?address=${encodeURIComponent(address)}`
    );
    if (!res.ok) {
      console.error("geocode lookup failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return {
      latitude: data.latitude,
      longitude: data.longitude,
    };
  } catch (e) {
    console.error("lookupAddress error", e);
    return null;
  }
}
