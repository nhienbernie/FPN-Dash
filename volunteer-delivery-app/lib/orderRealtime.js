import { useEffect, useRef } from "react";
import { normalizeOrderStatus, ORDER_STATUS } from "./orderStatus";
import { supabase } from "../services/supabase";

const ORDERS_TABLE = "orders";

const buildChannelName = (prefix, suffix) =>
  `${prefix}-${suffix}-${Math.random().toString(36).slice(2)}`;

function useLatestCallback(callback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return callbackRef;
}

export function useOrderSubscription({ orderId, onChange }) {
  const onChangeRef = useLatestCallback(onChange);

  useEffect(() => {
    if (!orderId) return undefined;

    const channel = supabase
      .channel(buildChannelName("order", orderId))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ORDERS_TABLE,
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          onChangeRef.current?.(payload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChangeRef, orderId]);
}

function isRelevantToVolunteerFeed(payload, volunteerUid) {
  if (!volunteerUid) return false;

  const nextStatus = normalizeOrderStatus(payload.new?.status);
  const previousStatus = normalizeOrderStatus(payload.old?.status);
  const nextVolunteer = payload.new?.volunteer_uid;
  const previousVolunteer = payload.old?.volunteer_uid;

  return (
    nextStatus === ORDER_STATUS.PENDING ||
    previousStatus === ORDER_STATUS.PENDING ||
    nextVolunteer === volunteerUid ||
    previousVolunteer === volunteerUid
  );
}

export function useOrdersFeedSubscription({ volunteerUid, onChange }) {
  const onChangeRef = useLatestCallback(onChange);

  useEffect(() => {
    if (!volunteerUid) return undefined;

    const channel = supabase
      .channel(buildChannelName("orders-feed", volunteerUid))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ORDERS_TABLE,
        },
        (payload) => {
          if (isRelevantToVolunteerFeed(payload, volunteerUid)) {
            onChangeRef.current?.(payload);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChangeRef, volunteerUid]);
}
