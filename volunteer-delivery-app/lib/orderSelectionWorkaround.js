const WORKAROUND_PREFIX = "WORKAROUND_ORDER_META::";

export function buildOrderNotes({ selectedItems = [], userNotes = "" }) {
  const cleanedItems = selectedItems
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const cleanedNotes = String(userNotes ?? "").trim();

  if (cleanedItems.length === 0) {
    return cleanedNotes || null;
  }

  return `${WORKAROUND_PREFIX}${JSON.stringify({
    selectedItems: cleanedItems,
    userNotes: cleanedNotes,
  })}`;
}

export function parseOrderNotes(notes) {
  const rawNotes = String(notes ?? "").trim();

  if (!rawNotes) {
    return {
      selectedItems: [],
      userNotes: "",
      isWorkaround: false,
    };
  }

  if (!rawNotes.startsWith(WORKAROUND_PREFIX)) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
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
      userNotes: String(payload.userNotes ?? "").trim(),
      isWorkaround: true,
    };
  } catch (_error) {
    return {
      selectedItems: [],
      userNotes: rawNotes,
      isWorkaround: false,
    };
  }
}
