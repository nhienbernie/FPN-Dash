const EARTH_RADIUS_MILES = 3958.8;
const DEFAULT_CITY_SPEED_MPH = 25;

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

export function hasCoordinates(coords) {
  return (
    coords &&
    Number.isFinite(Number(coords.latitude)) &&
    Number.isFinite(Number(coords.longitude))
  );
}

export function calculateDistanceMiles(origin, destination) {
  if (!hasCoordinates(origin) || !hasCoordinates(destination)) {
    return null;
  }

  const originLat = Number(origin.latitude);
  const originLon = Number(origin.longitude);
  const destinationLat = Number(destination.latitude);
  const destinationLon = Number(destination.longitude);

  const deltaLat = degreesToRadians(destinationLat - originLat);
  const deltaLon = degreesToRadians(destinationLon - originLon);
  const originLatRadians = degreesToRadians(originLat);
  const destinationLatRadians = degreesToRadians(destinationLat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLatRadians) *
      Math.cos(destinationLatRadians) *
      Math.sin(deltaLon / 2) ** 2;

  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_MILES * centralAngle;
}

export function estimateTravelMinutes(
  distanceMiles,
  averageSpeedMph = DEFAULT_CITY_SPEED_MPH,
) {
  if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
    return null;
  }

  const rawMinutes = (distanceMiles / averageSpeedMph) * 60;
  return Math.max(5, Math.round(rawMinutes));
}

export function formatDistanceMiles(distanceMiles) {
  if (!Number.isFinite(distanceMiles)) {
    return "";
  }

  if (distanceMiles < 10) {
    return `${distanceMiles.toFixed(1)} miles`;
  }

  return `${Math.round(distanceMiles)} miles`;
}

export function formatEtaMinutes(etaMinutes) {
  if (!Number.isFinite(etaMinutes)) {
    return "";
  }

  if (etaMinutes < 60) {
    return `about ${etaMinutes} min`;
  }

  const hours = Math.floor(etaMinutes / 60);
  const minutes = etaMinutes % 60;

  if (minutes === 0) {
    return `about ${hours} hr`;
  }

  return `about ${hours} hr ${minutes} min`;
}
