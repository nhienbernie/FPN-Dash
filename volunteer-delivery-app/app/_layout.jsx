import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="mode-select" options={{ headerShown: false }} />
      <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
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
