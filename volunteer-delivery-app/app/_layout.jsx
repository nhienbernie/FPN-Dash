import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Home" }} />
      <Stack.Screen
        name="volunteer-signup"
        options={{ title: "Volunteer Sign Up" }}
      />
      <Stack.Screen
        name="volunteer-signin"
        options={{ title: "Volunteer Sign In" }}
      />
    </Stack>
  );
}
