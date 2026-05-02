import { ORDER_STATUS, getOrderStatusMeta } from "./orderStatus";
import { parseOrderNotes } from "./orderSelectionWorkaround";
import { theme } from "../theme";

export const ADMIN_TABS = [
  { key: "menu", label: "Menu Setup" },
  { key: "cancellations", label: "Cancellations" },
  { key: "complaints", label: "Complaints" },
  { key: "analytics", label: "Analytics" },
  { key: "history", label: "History" },
];

export const CANCELLABLE_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ACCEPTED,
];

export const OPEN_REPORT_STATUSES = ["pending", "reviewed", "escalated"];

const REPORT_REASON_META = {
  unsafe: {
    label: "Unsafe situation",
    severity: "High",
    queueSummary: "Needs same-day admin review.",
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    accentColor: theme.colors.danger,
  },
  harassment: {
    label: "Harassment",
    severity: "High",
    queueSummary: "Review context and consider escalation.",
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    accentColor: "#C2410C",
  },
  no_show: {
    label: "No show",
    severity: "Medium",
    queueSummary: "Check delivery timeline and assignment history.",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    accentColor: "#A16207",
  },
  other: {
    label: "Other",
    severity: "Medium",
    queueSummary: "Needs manual triage.",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    accentColor: "#1D4ED8",
  },
};

const REPORT_STATUS_META = {
  pending: {
    label: "New",
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  reviewed: {
    label: "Under review",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  escalated: {
    label: "Escalated",
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  resolved: {
    label: "Resolved",
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
};

function normalizeText(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getMetricValue(metrics, key) {
  return metrics.find((metric) => metric.key === key)?.value ?? 0;
}

export function generateMenuItemKey(label) {
  const base = normalizeText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const suffix = Date.now().toString(36).slice(-4);
  return `${base || "menu_item"}_${suffix}`;
}

export function getReportReasonMeta(reason) {
  const normalized = normalizeText(reason).toLowerCase();
  return (
    REPORT_REASON_META[normalized] || {
      label: normalized ? normalized.replace(/_/g, " ") : "Concern",
      severity: "Medium",
      queueSummary: "Needs manual triage.",
      backgroundColor: "#F8FAFC",
      borderColor: theme.colors.border,
      accentColor: theme.colors.text,
    }
  );
}

export function getReportStatusMeta(status) {
  const normalized = normalizeText(status).toLowerCase();
  return (
    REPORT_STATUS_META[normalized] || {
      label: normalized || "Unknown",
      backgroundColor: "#F8FAFC",
      borderColor: theme.colors.border,
    }
  );
}

export function formatElapsedSince(value) {
  if (!value) return "Unknown";

  const createdAt = new Date(value);
  const diffMs = Date.now() - createdAt.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "Just now";
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatQueueAge(value) {
  if (!value) return "Unknown age";

  const createdAt = new Date(value);
  const diffMs = Date.now() - createdAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "Just opened";
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 60) {
    return `${diffMinutes || 1}m waiting`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h waiting`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d waiting`;
}

export function buildMenuSections(items = []) {
  const grouped = {};

  for (const item of items) {
    const name = normalizeText(item.category) || "Other";
    const isActive = item.active !== false;

    if (!grouped[name]) {
      grouped[name] = {
        name,
        items: [],
        activeItemCount: 0,
        inactiveItemCount: 0,
      };
    }

    grouped[name].items.push({
      ...item,
      category: name,
      active: isActive,
    });

    if (isActive) {
      grouped[name].activeItemCount += 1;
    } else {
      grouped[name].inactiveItemCount += 1;
    }
  }

  return Object.values(grouped)
    .map((section) => ({
      ...section,
      isVisible: section.activeItemCount > 0,
      itemCount: section.items.length,
      items: [...section.items].sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }

        return normalizeText(a.label).localeCompare(normalizeText(b.label));
      }),
    }))
    .sort((a, b) => {
      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
}

export function getOrderBoxDetails(order) {
  const boxes = [...(order?.boxes ?? [])].sort(
    (a, b) => (a?.box_number ?? 0) - (b?.box_number ?? 0),
  );

  return boxes.map((box) => ({
    boxId: box.box_id,
    boxNumber: box.box_number,
    itemIds: (box.order_items ?? [])
      .map((entry) => entry.item_id)
      .filter((itemId) => itemId !== null && itemId !== undefined),
    items: unique(
      (box.order_items ?? [])
        .map((entry) => entry.items?.label)
        .map((label) => normalizeText(label)),
    ),
  }));
}

export function getOrderSummary(order) {
  const parsedNotes = parseOrderNotes(order?.notes);
  const boxDetails = getOrderBoxDetails(order);
  const boxItems = boxDetails.flatMap((box) => box.items);
  const itemLabels = boxItems.length > 0 ? unique(boxItems) : parsedNotes.selectedItems;

  return {
    parsedNotes,
    boxDetails,
    itemLabels,
    boxCount: boxDetails.length || Number(order?.box_count) || 1,
    specialInstructions: parsedNotes.userNotes,
  };
}

export function getCustomerLabel(order, customerMap = {}) {
  const directName = normalizeText(order?.name);
  const mappedName = normalizeText(customerMap[order?.customer_uid]);
  return directName || mappedName || "Customer";
}

export function isOrderCancellable(status) {
  return CANCELLABLE_ORDER_STATUSES.includes(status);
}

export function isComplaintOpen(status) {
  return OPEN_REPORT_STATUSES.includes(normalizeText(status).toLowerCase());
}

export function buildAdminMetrics(orders, reports, items) {
  const sections = buildMenuSections(items);
  const liveSections = sections.filter((section) => section.isVisible).length;
  const hiddenSections = sections.filter((section) => !section.isVisible).length;
  const liveItems = items.filter((item) => item.active !== false).length;
  const cancellableOrders = orders.filter((order) => isOrderCancellable(order.status)).length;
  const openComplaints = reports.filter((report) => isComplaintOpen(report.status)).length;
  const urgentComplaints = reports.filter((report) => {
    if (!isComplaintOpen(report.status)) {
      return false;
    }

    return getReportReasonMeta(report.reason).severity === "High";
  }).length;

  return [
    {
      key: "liveSections",
      label: "Live sections",
      value: liveSections,
      accent: theme.colors.primary,
    },
    {
      key: "liveItems",
      label: "Live items",
      value: liveItems,
      accent: theme.colors.infoText,
    },
    {
      key: "cancellations",
      label: "Cancellations",
      value: cancellableOrders,
      accent: theme.colors.secondary,
    },
    {
      key: "openComplaints",
      label: "Open complaints",
      value: openComplaints,
      accent: theme.colors.danger,
    },
    {
      key: "hiddenSections",
      label: "Hidden sections",
      value: hiddenSections,
      accent: theme.colors.mutedText,
    },
    {
      key: "urgentComplaints",
      label: "Urgent complaints",
      value: urgentComplaints,
      accent: "#C2410C",
    },
  ];
}

export function buildQueueHeadline(metrics) {
  const urgentComplaints = getMetricValue(metrics, "urgentComplaints");
  const hiddenSections = getMetricValue(metrics, "hiddenSections");
  const cancellations = getMetricValue(metrics, "cancellations");
  const liveSections = getMetricValue(metrics, "liveSections");

  if (urgentComplaints > 0) {
    return `${urgentComplaints} urgent complaint${urgentComplaints === 1 ? "" : "s"} need attention.`;
  }

  if (hiddenSections > 0) {
    return `${hiddenSections} menu section${hiddenSections === 1 ? "" : "s"} are hidden from requesters right now.`;
  }

  if (cancellations > 0) {
    return `${cancellations} order cancellation${cancellations === 1 ? "" : "s"} can be cleared next.`;
  }

  if (liveSections > 0) {
    return `${liveSections} menu section${liveSections === 1 ? "" : "s"} are currently available to requesters.`;
  }

  return "No urgent admin actions are waiting right now.";
}

export function getOrderStatusBadge(order) {
  return getOrderStatusMeta(order?.status);
}

export function buildVolunteerStats(orders, volunteersById) {
  const statsById = {};

  const ensureEntry = (uid) => {
    if (!statsById[uid]) {
      statsById[uid] = { completed: 0, inProgress: 0, relinquished: 0 };
    }
  };

  for (const order of orders) {
    // Tally active / delivered orders by their current volunteer_uid
    if (order.volunteer_uid) {
      ensureEntry(order.volunteer_uid);
      if (order.status === ORDER_STATUS.DELIVERED) {
        statsById[order.volunteer_uid].completed += 1;
      } else if (
        order.status === ORDER_STATUS.ACCEPTED ||
        order.status === ORDER_STATUS.IN_TRANSIT
      ) {
        statsById[order.volunteer_uid].inProgress += 1;
      }
    }

    // Tally relinquishments — stored in notes so they survive the volunteer_uid
    // being cleared when the order was returned to the queue.
    const parsedNotes = parseOrderNotes(order.notes);
    if (parsedNotes.relinquishment?.relinquishedBy) {
      const uid = parsedNotes.relinquishment.relinquishedBy;
      ensureEntry(uid);
      statsById[uid].relinquished += 1;
    }
  }

  return Object.entries(statsById)
    .map(([uid, stats]) => {
      const total = stats.completed + stats.inProgress;
      return {
        uid,
        name: normalizeText(volunteersById[uid]) || "Unknown",
        completed: stats.completed,
        inProgress: stats.inProgress,
        relinquished: stats.relinquished,
        total,
        // Completion rate only reflects finished vs. active assignments —
        // relinquishments are tracked separately and intentionally excluded
        // so volunteers aren't penalised for circumstances outside their control.
        completionRate: total > 0 ? Math.round((stats.completed / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.completed - a.completed);
}

export function buildOrdersByStatus(orders) {
  const counts = {
    [ORDER_STATUS.PENDING]: 0,
    [ORDER_STATUS.ACCEPTED]: 0,
    [ORDER_STATUS.IN_TRANSIT]: 0,
    [ORDER_STATUS.DELIVERED]: 0,
  };

  for (const order of orders) {
    if (counts[order.status] !== undefined) {
      counts[order.status] += 1;
    }
  }

  return counts;
}

export function buildOrdersPerDay(orders, days = 7) {
  const result = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const count = orders.filter((o) => {
      const t = new Date(o.created_at);
      return t >= dayStart && t <= dayEnd;
    }).length;

    result.push({ label: dateStr, count });
  }

  return result;
}

export function buildCsvContent(orders, customersById, volunteersById) {
  const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

  const header = [
    "Order ID",
    "Customer",
    "Status",
    "Created At",
    "Delivery Address",
    "Volunteer",
    "Boxes",
  ].map(escape);

  const rows = orders.map((order) => {
    const customerName = getCustomerLabel(order, customersById);
    const volunteerName = order.volunteer_uid
      ? normalizeText(volunteersById[order.volunteer_uid])
      : "";
    const boxes = order.box_count || (order.boxes?.length ?? 1);

    return [
      order.order_id,
      customerName,
      order.status,
      order.created_at,
      order.delivery_address || "",
      volunteerName,
      boxes,
    ].map(escape);
  });

  return [header, ...rows].map((row) => row.join(",")).join("\n");
}
