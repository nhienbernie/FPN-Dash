import { theme } from "../theme";

export const ORDER_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
};

const LEGACY_STATUS_ALIASES = {
  "awaiting delivery": ORDER_STATUS.ACCEPTED,
};

export const ORDER_PROGRESS_STAGES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.DELIVERED,
];

export const ACTIVE_CUSTOMER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.IN_TRANSIT,
];

export const ACTIVE_VOLUNTEER_STATUSES = [
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.IN_TRANSIT,
];

export const TERMINAL_ORDER_STATUSES = [ORDER_STATUS.DELIVERED];

export const ORDER_STATUS_META = {
  [ORDER_STATUS.PENDING]: {
    label: "Pending",
    description: "We received your order.",
    volunteerDescription: "Waiting for you to start the delivery.",
    stepIndex: 0,
    accentColor: theme.colors.primary,
    backgroundColor: "#FFFAEB",
    borderColor: "#FEC84B",
  },
  [ORDER_STATUS.ACCEPTED]: {
    label: "Accepted",
    description: "A volunteer accepted your order.",
    volunteerDescription: "You accepted this order. Head to the pantry to pick it up.",
    stepIndex: 1,
    accentColor: theme.colors.primary,
    backgroundColor: "#EFF8FF",
    borderColor: "#84CAFF",
  },
  [ORDER_STATUS.IN_TRANSIT]: {
    label: "In Transit",
    description: "Your delivery is on the way.",
    volunteerDescription: "Delivery in progress — head to the customer's address.",
    stepIndex: 2,
    accentColor: theme.colors.primary,
    backgroundColor: "#F4F3FF",
    borderColor: "#BDB4FE",
  },
  [ORDER_STATUS.DELIVERED]: {
    label: "Delivered",
    description: "Your order was delivered.",
    volunteerDescription: "You marked this order as delivered.",
    stepIndex: 3,
    accentColor: theme.colors.primary,
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
};

const ORDER_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.ACCEPTED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.IN_TRANSIT],
  [ORDER_STATUS.IN_TRANSIT]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
};

export function normalizeOrderStatus(status) {
  if (!status) return ORDER_STATUS.PENDING;

  const normalized = String(status).trim().toLowerCase();
  return LEGACY_STATUS_ALIASES[normalized] || normalized;
}

export function normalizeOrder(order) {
  if (!order) return order;

  return {
    ...order,
    status: normalizeOrderStatus(order.status),
  };
}

export function getOrderStatusMeta(status) {
  const normalizedStatus = normalizeOrderStatus(status);
  return ORDER_STATUS_META[normalizedStatus] || ORDER_STATUS_META[ORDER_STATUS.PENDING];
}

export function canTransition(fromStatus, toStatus) {
  const normalizedFrom = normalizeOrderStatus(fromStatus);
  const normalizedTo = normalizeOrderStatus(toStatus);

  return ORDER_TRANSITIONS[normalizedFrom]?.includes(normalizedTo) ?? false;
}

export function canCancelOrder(status) {
  return normalizeOrderStatus(status) === ORDER_STATUS.PENDING;
}

export function isVolunteerOrderActive(status) {
  return ACTIVE_VOLUNTEER_STATUSES.includes(normalizeOrderStatus(status));
}

export function isCustomerOrderActive(status) {
  return ACTIVE_CUSTOMER_STATUSES.includes(normalizeOrderStatus(status));
}
