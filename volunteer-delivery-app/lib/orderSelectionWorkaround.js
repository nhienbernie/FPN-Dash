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

function sanitizeDeliveryProof(proof) {
  if (!proof || typeof proof !== "object") return null;
  const photoUri = normalizeText(proof.photoUri);
  const capturedAt = normalizeText(proof.capturedAt);
  if (!photoUri) return null;
  return { photoUri, ...(capturedAt ? { capturedAt } : {}) };
}

function sanitizeRelinquishment(r) {
  if (!r || typeof r !== "object") return null;
  const relinquishedBy = normalizeText(r.relinquishedBy);
  const relinquishedAt = normalizeText(r.relinquishedAt);
  if (!relinquishedBy) return null;
  return { relinquishedBy, ...(relinquishedAt ? { relinquishedAt } : {}) };
}

function sanitizeRelinquishments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(sanitizeRelinquishment).filter(Boolean);
}

export function buildOrderNotes({
  selectedItems = [],
  userNotes = "",
  tracking = null,
  deliveryProof = null,
  relinquishments = [],
}) {
  const cleanedItems = selectedItems
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const cleanedNotes = normalizeText(userNotes);
  const cleanedTracking = sanitizeTracking(tracking);
  const cleanedProof = sanitizeDeliveryProof(deliveryProof);
  const cleanedRelinquishments = sanitizeRelinquishments(relinquishments);

  if (cleanedItems.length === 0 && !cleanedTracking && !cleanedProof && cleanedRelinquishments.length === 0) {
    return cleanedNotes || null;
  }

  const payload = {
    selectedItems: cleanedItems,
    userNotes: cleanedNotes,
  };

  if (cleanedTracking) {
    payload.tracking = cleanedTracking;
  }

  if (cleanedProof) {
    payload.deliveryProof = cleanedProof;
  }

  if (cleanedRelinquishments.length > 0) {
    payload.relinquishments = cleanedRelinquishments;
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
      deliveryProof: null,
      relinquishments: [],
      isWorkaround: false,
    };
  }

  if (!rawNotes.startsWith(WORKAROUND_PREFIX)) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
      tracking: null,
      deliveryProof: null,
      relinquishments: [],
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

    // Migrate legacy single-object relinquishment to array
    const rawRelinquishments = Array.isArray(payload.relinquishments)
      ? payload.relinquishments
      : payload.relinquishment
        ? [payload.relinquishment]
        : [];

    return {
      selectedItems,
      userNotes: normalizeText(payload.userNotes),
      tracking: sanitizeTracking(payload.tracking),
      deliveryProof: sanitizeDeliveryProof(payload.deliveryProof ?? null),
      relinquishments: sanitizeRelinquishments(rawRelinquishments),
      isWorkaround: true,
    };
  } catch (_error) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
      tracking: null,
      relinquishments: [],
      isWorkaround: false,
    };
  }
}

export function attachDeliveryProof(notes, photoUri) {
  const existing = parseOrderNotes(notes);
  return buildOrderNotes({
    selectedItems: existing.selectedItems,
    userNotes: existing.userNotes,
    tracking: existing.tracking,
    deliveryProof: photoUri
      ? { photoUri, capturedAt: new Date().toISOString() }
      : null,
  });
}

// Stamps the notes with who released the order and when, then clears tracking
// so stale volunteer-location data is not visible to the next volunteer.
export function buildRelinquishmentNotes(notes, volunteerUid) {
  const existing = parseOrderNotes(notes);
  return buildOrderNotes({
    selectedItems: existing.selectedItems,
    userNotes: existing.userNotes,
    tracking: null,
    deliveryProof: existing.deliveryProof,
    relinquishments: [
      ...existing.relinquishments,
      { relinquishedBy: volunteerUid, relinquishedAt: new Date().toISOString() },
    ],
  });
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
    deliveryProof: existing.deliveryProof,
    relinquishments: existing.relinquishments,
  });
}
