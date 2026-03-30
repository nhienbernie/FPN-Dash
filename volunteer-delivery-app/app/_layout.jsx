import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="mode-select" options={{ headerShown: false }} />
      <Stack.Screen name="volunteer-options" options={{ title: "Volunteer Portal" }} />
      <Stack.Screen name="volunteer-signup" options={{ title: "Volunteer Sign Up" }} />
      <Stack.Screen name="volunteer-signin" options={{ title: "Volunteer Sign In" }} />
      <Stack.Screen name="requester" options={{ title: "Request Food Assistance" }} />
      <Stack.Screen name="order-food" options={{ title: "Order Food" }} />
      <Stack.Screen name="order-items" options={{ title: "Order Items" }} />
      <Stack.Screen name="order-status" options={{ title: "Order Status" }} />
    </Stack>
  );
}