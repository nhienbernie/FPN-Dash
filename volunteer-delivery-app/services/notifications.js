import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Show notifications when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permissions and returns the Expo push token string,
 * or null if permissions were denied or running in a simulator.
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  // Try with projectId first, then without (works in Expo Go dev builds)
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    console.log("[notifications] Push token obtained:", token);
    return token;
  } catch (err) {
    console.warn("[notifications] getExpoPushTokenAsync failed:", err.message);
    // Fallback: try without projectId (Expo Go)
    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync();
      console.log("[notifications] Push token obtained (fallback):", token);
      return token;
    } catch (err2) {
      console.warn("[notifications] Push token fallback also failed:", err2.message);
      return null;
    }
  }
}

/**
 * Saves or updates this device's push token in Supabase.
 * role is either 'volunteer' or 'requester'.
 */
export async function savePushToken(userId, token, role) {
  if (!userId || !token) return;
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: token,
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) console.warn("[notifications] savePushToken error:", error.message);
}

/**
 * Removes this user's push token (call on sign-out).
 */
export async function removePushToken(userId) {
  if (!userId) return;
  await supabase.from("push_tokens").delete().eq("user_id", userId);
}

/**
 * Returns all Expo push tokens for users with the given role.
 */
export async function getTokensByRole(role) {
  const { data, error } = await supabase
    .from("push_tokens")
    .select("expo_push_token")
    .eq("role", role);
  if (error) {
    console.warn("[notifications] getTokensByRole error:", error.message);
    return [];
  }
  return data.map((r) => r.expo_push_token).filter(Boolean);
}

/**
 * Returns the Expo push token for a specific user, or null.
 */
export async function getTokenForUser(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.expo_push_token;
}

/**
 * Sends push notifications to one or more Expo push tokens via the Expo Push API.
 * tokens can be a string or an array of strings.
 */
export async function sendPushNotifications(tokens, title, body, data = {}) {
  const tokenList = (Array.isArray(tokens) ? tokens : [tokens]).filter(
    (t) => typeof t === "string" && t.startsWith("ExponentPushToken[")
  );
  if (tokenList.length === 0) return;

  const messages = tokenList.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data,
  }));

  try {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.warn("[notifications] sendPushNotifications error:", err.message);
  }
}

/**
 * Schedules an immediate local notification (shown while app is foregrounded).
 */
export async function showLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: "default" },
    trigger: null,
  });
}
