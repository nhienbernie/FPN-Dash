import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="user-signin" options={{ title: "Sign In" }} />
      <Stack.Screen name="mode-select" options={{ title: "Choose Mode" }} />
      {/* volunteer-signup and volunteer-signin added by Safal's branch */}
    </Stack>
  );
}
