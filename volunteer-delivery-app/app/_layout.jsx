import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import {
  registerForPushNotificationsAsync,
  savePushToken,
  removePushToken,
  getTokensByRole,
  getTokenForUser,
  sendPushNotifications,
  showLocalNotification,
} from "../services/notifications";

export default function RootLayout() {
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    let ordersChannel = null;
    let currentUserId = null;
    let currentRole = null;

    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {});
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(() => {});

    const teardownChannel = () => {
      if (ordersChannel) {
        supabase.removeChannel(ordersChannel);
        ordersChannel = null;
      }
    };

    const init = async (userId, role) => {
      teardownChannel();
      const pushToken = await registerForPushNotificationsAsync();
      await savePushToken(userId, pushToken, role);

      ordersChannel = supabase
        .channel("orders-push-notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          async (payload) => {
            const order = payload.new;
            if (role === "volunteer") {
              await showLocalNotification(
                "New Delivery Request",
                `A food order is ready for pickup — ${order.name || "customer"}.`,
                { orderId: order.order_id }
              );
            }
            if (role === "requester" && order.customer_uid === userId) {
              const volunteerTokens = await getTokensByRole("volunteer");
              await sendPushNotifications(
                volunteerTokens,
                "New Delivery Request",
                "A food pantry delivery request is waiting for a volunteer.",
                { orderId: order.order_id }
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          async (payload) => {
            const updated = payload.new;
            if (updated.status === "awaiting delivery") {
              if (role === "volunteer") {
                const customerToken = await getTokenForUser(updated.customer_uid);
                await sendPushNotifications(
                  customerToken ? [customerToken] : [],
                  "Order Accepted",
                  "A volunteer has accepted your delivery order!",
                  { orderId: updated.order_id }
                );
              }
              if (role === "requester" && updated.customer_uid === userId) {
                await showLocalNotification(
                  "Order Accepted",
                  "A volunteer has accepted your delivery order and is on the way!",
                  { orderId: updated.order_id }
                );
              }
            }
            if (updated.status === "delivered") {
              if (role === "volunteer") {
                const customerToken = await getTokenForUser(updated.customer_uid);
                await sendPushNotifications(
                  customerToken ? [customerToken] : [],
                  "Delivery Complete",
                  "Your food delivery has been completed. Enjoy your meal!",
                  { orderId: updated.order_id }
                );
              }
              if (role === "requester" && updated.customer_uid === userId) {
                await showLocalNotification(
                  "Delivery Complete",
                  "Your food delivery has been completed. Enjoy your meal!",
                  { orderId: updated.order_id }
                );
              }
            }
          }
        )
        .subscribe();
    };

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session?.user
      ) {
        currentUserId = session.user.id;
        currentRole =
          session.user.user_metadata?.role === "requester"
            ? "requester"
            : "volunteer";
        await init(currentUserId, currentRole);
      }
      if (event === "SIGNED_OUT") {
        if (currentUserId) await removePushToken(currentUserId);
        currentUserId = null;
        currentRole = null;
        teardownChannel();
      }
    });

    return () => {
      teardownChannel();
      notificationListener.current?.remove();
      responseListener.current?.remove();
      authSub.unsubscribe();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="mode-select" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-options" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-signup" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-signin" options={{ headerShown: false }} />
      <Stack.Screen name="requester" options={{ headerShown: false }} />
      <Stack.Screen name="order-food" options={{ headerShown: false }} />
      <Stack.Screen name="order-boxes" options={{ headerShown: false }} />
      <Stack.Screen name="order-items" options={{ headerShown: false }} />
      <Stack.Screen name="order-review" options={{ headerShown: false }} />
      <Stack.Screen name="order-status" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-home" options={{ headerShown: false }} />
      <Stack.Screen name="confirm-delivery" options={{ headerShown: false }} />
    </Stack>
  );
}
