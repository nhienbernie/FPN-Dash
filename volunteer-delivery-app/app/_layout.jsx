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
<<<<<<< HEAD
        name="volunteer-signin"
        options={{ title: "Volunteer Sign In" }}
=======
        name="volunteer-dashboard"
        options={{ title: "Volunteer Dashboard" }}
      />
      <Stack.Screen
        name="confirm-delivery"
        options={{ title: "Confirm Delivery" }}
>>>>>>> origin/Beck-sprint2
      />
    </Stack>
  );
}
