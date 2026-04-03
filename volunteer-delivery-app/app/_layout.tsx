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
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    // Using a ref to hold channel so the cleanup closure captures it correctly
    let ordersChannel: ReturnType<typeof supabase.channel> | null = null;
    let currentUserId: string | null = null;
    let currentRole: "volunteer" | "requester" | null = null;
    let pushToken: string | null = null;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      currentUserId = user.id;
      // Requesters are created via the Railway server and have role set in metadata
      currentRole =
        user.user_metadata?.role === "requester" ? "requester" : "volunteer";

      console.log("[layout] User signed in:", user.id, "role:", currentRole);

      // Register device for push notifications and persist the token
      pushToken = await registerForPushNotificationsAsync();
      console.log("[layout] Push token:", pushToken);
      await savePushToken(user.id, pushToken, currentRole);

      // Subscribe to order changes via Supabase Realtime
      ordersChannel = supabase
        .channel("orders-push-notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          async (payload) => {
            console.log("[realtime] INSERT received:", payload.new);
            const order = payload.new as Record<string, unknown>;

            if (currentRole === "volunteer") {
              // Volunteer in foreground: show local notification for new order
              await showLocalNotification(
                "New Delivery Request",
                `A food order is ready for pickup — ${order.name || "customer"}.`,
                { orderId: order.order_id }
              );
            }

            if (
              currentRole === "requester" &&
              order.customer_uid === currentUserId
            ) {
              // The customer who just placed the order notifies backgrounded volunteers
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
            const updated = payload.new as Record<string, unknown>;

            // Volunteer accepted the order → notify the customer
            if (updated.status === "awaiting delivery") {
              if (currentRole === "volunteer") {
                // Accepting volunteer's device sends push to the customer
                const customerToken = await getTokenForUser(
                  updated.customer_uid as string
                );
                await sendPushNotifications(
                  customerToken ? [customerToken] : [],
                  "Order Accepted",
                  "A volunteer has accepted your delivery order and is on the way!",
                  { orderId: updated.order_id }
                );
              }

              if (
                currentRole === "requester" &&
                updated.customer_uid === currentUserId
              ) {
                // Customer in foreground: show local notification
                await showLocalNotification(
                  "Order Accepted",
                  "A volunteer has accepted your delivery order and is on the way!",
                  { orderId: updated.order_id }
                );
              }
            }

            // Delivery marked complete → notify the customer
            if (updated.status === "delivered") {
              if (currentRole === "volunteer") {
                const customerToken = await getTokenForUser(
                  updated.customer_uid as string
                );
                await sendPushNotifications(
                  customerToken ? [customerToken] : [],
                  "Delivery Complete",
                  "Your food delivery has been completed. Enjoy your meal!",
                  { orderId: updated.order_id }
                );
              }

              if (
                currentRole === "requester" &&
                updated.customer_uid === currentUserId
              ) {
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

      // Fired when a notification arrives while the app is foregrounded
      notificationListener.current =
        Notifications.addNotificationReceivedListener(() => {
          // Already handled via showLocalNotification above
        });

      // Fired when the user taps a notification
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((_response) => {
          // Future: navigate to the relevant order screen on tap
        });
    };

    // Re-run init on sign-in; clean up channel on sign-out
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN") {
        await init();
      }
      if (event === "SIGNED_OUT") {
        if (currentUserId) await removePushToken(currentUserId);
        currentUserId = null;
        currentRole = null;
        pushToken = null;
        if (ordersChannel) {
          supabase.removeChannel(ordersChannel);
          ordersChannel = null;
        }
      }
    });

    init();

    return () => {
      if (ordersChannel) supabase.removeChannel(ordersChannel);
      notificationListener.current?.remove();
      responseListener.current?.remove();
      authSub.unsubscribe();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="mode-select" options={{ headerShown: false }} />
      <Stack.Screen
        name="volunteer-options"
        options={{ title: "Volunteer Portal" }}
      />
      <Stack.Screen
        name="volunteer-signup"
        options={{ title: "Volunteer Sign Up" }}
      />
      <Stack.Screen
        name="volunteer-signin"
        options={{ title: "Volunteer Sign In" }}
      />
      <Stack.Screen
        name="requester"
        options={{ title: "Request Food Assistance" }}
      />
    </Stack>
  );
}
