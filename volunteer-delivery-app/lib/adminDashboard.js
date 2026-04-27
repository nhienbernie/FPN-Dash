import { ORDER_STATUS, getOrderStatusMeta } from "./orderStatus";
import { parseOrderNotes } from "./orderSelectionWorkaround";
import { theme } from "../theme";

export const ADMIN_TABS = [
  { key: "changes", label: "Menu Changes" },
  { key: "cancellations", label: "Cancellations" },
  { key: "complaints", label: "Complaints" },
];

export const MENU_EDITABLE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ACCEPTED,
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

export function isMenuEditable(status) {
  return MENU_EDITABLE_STATUSES.includes(status);
}

export function isOrderCancellable(status) {
  return CANCELLABLE_ORDER_STATUSES.includes(status);
}

export function isComplaintOpen(status) {
  return OPEN_REPORT_STATUSES.includes(normalizeText(status).toLowerCase());
}

export function buildAdminMetrics(orders, reports) {
  const menuChanges = orders.filter((order) => isMenuEditable(order.status)).length;
  const cancellations = orders.filter((order) => isOrderCancellable(order.status)).length;
  const openComplaints = reports.filter((report) => isComplaintOpen(report.status)).length;
  const urgentComplaints = reports.filter((report) => {
    if (!isComplaintOpen(report.status)) {
      return false;
    }

    return getReportReasonMeta(report.reason).severity === "High";
  }).length;
  const activeDeliveries = orders.filter(
    (order) => order.status === ORDER_STATUS.ACCEPTED || order.status === ORDER_STATUS.IN_TRANSIT,
  ).length;

  return [
    {
      label: "Menu changes",
      value: menuChanges,
      accent: theme.colors.primary,
    },
    {
      label: "Cancellations",
      value: cancellations,
      accent: theme.colors.secondary,
    },
    {
      label: "Open complaints",
      value: openComplaints,
      accent: theme.colors.danger,
    },
    {
      label: "Active deliveries",
      value: activeDeliveries,
      accent: theme.colors.infoText,
    },
    {
      label: "Urgent complaints",
      value: urgentComplaints,
      accent: "#C2410C",
    },
  ];
}

export function buildQueueHeadline(metrics) {
  if (metrics[4]?.value > 0) {
    return `${metrics[4].value} urgent complaint${metrics[4].value === 1 ? "" : "s"} need attention.`;
  }

  if (metrics[1]?.value > 0) {
    return `${metrics[1].value} order cancellation${metrics[1].value === 1 ? "" : "s"} can be cleared next.`;
  }

  if (metrics[0]?.value > 0) {
    return `${metrics[0].value} order menu update${metrics[0].value === 1 ? "" : "s"} are ready to review.`;
  }

  return "No urgent admin actions are waiting right now.";
}

export function getOrderStatusBadge(order) {
  return getOrderStatusMeta(order?.status);
}
