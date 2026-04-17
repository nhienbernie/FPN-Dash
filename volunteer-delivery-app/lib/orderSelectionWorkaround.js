const WORKAROUND_PREFIX = "WORKAROUND_ORDER_META::";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeVolunteerCoords(coords) {
  if (!coords || typeof coords !== "object") {
    return null;
  }

  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const capturedAt = normalizeText(coords.capturedAt);
  const sharedForStatus = normalizeText(coords.sharedForStatus);

  return {
    latitude,
    longitude,
    ...(capturedAt ? { capturedAt } : {}),
    ...(sharedForStatus ? { sharedForStatus } : {}),
  };
}

function sanitizeTracking(tracking) {
  if (!tracking || typeof tracking !== "object") {
    return null;
  }

  const volunteerCoords = sanitizeVolunteerCoords(tracking.volunteerCoords);
  if (!volunteerCoords) {
    return null;
  }

  return { volunteerCoords };
}

export function buildOrderNotes({
  selectedItems = [],
  userNotes = "",
  tracking = null,
}) {
  const cleanedItems = selectedItems
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const cleanedNotes = normalizeText(userNotes);
  const cleanedTracking = sanitizeTracking(tracking);

  if (cleanedItems.length === 0 && !cleanedTracking) {
    return cleanedNotes || null;
  }

  const payload = {
    selectedItems: cleanedItems,
    userNotes: cleanedNotes,
  };

  if (cleanedTracking) {
    payload.tracking = cleanedTracking;
  }

  return `${WORKAROUND_PREFIX}${JSON.stringify(payload)}`;
}

export function parseOrderNotes(notes) {
  const rawNotes = normalizeText(notes);

  if (!rawNotes) {
    return {
      selectedItems: [],
      userNotes: "",
      tracking: null,
      isWorkaround: false,
    };
  }

  if (!rawNotes.startsWith(WORKAROUND_PREFIX)) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
      tracking: null,
      isWorkaround: false,
    };
  }

  try {
    const payload = JSON.parse(rawNotes.slice(WORKAROUND_PREFIX.length));
    const selectedItems = Array.isArray(payload.selectedItems)
      ? payload.selectedItems
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];

    return {
      selectedItems,
      userNotes: normalizeText(payload.userNotes),
      tracking: sanitizeTracking(payload.tracking),
      isWorkaround: true,
    };
  } catch (_error) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
      tracking: null,
      isWorkaround: false,
    };
  }
}

export function updateOrderTracking(notes, trackingUpdates) {
  const existing = parseOrderNotes(notes);
  const hasVolunteerCoordsUpdate =
    trackingUpdates &&
    Object.prototype.hasOwnProperty.call(trackingUpdates, "volunteerCoords");

  const nextTracking = hasVolunteerCoordsUpdate
    ? sanitizeTracking({
        volunteerCoords: trackingUpdates.volunteerCoords,
      })
    : existing.tracking;

  return buildOrderNotes({
    selectedItems: existing.selectedItems,
    userNotes: existing.userNotes,
    tracking: nextTracking,
  });
}
