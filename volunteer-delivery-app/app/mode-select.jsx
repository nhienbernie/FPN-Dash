import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";
import { supabase } from "../lib/supabase";

export default function ModeSelectScreen() {
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);
    };
    fetchUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/user-signin");
  };

  return (
    <View style={styles.container}>
      {userEmail ? (
        <Text style={styles.greeting}>Signed in as {userEmail}</Text>
      ) : null}

      <Text style={styles.title}>How would you like to continue?</Text>
      <Text style={styles.subtitle}>Choose your role for this session.</Text>

      <AppButton
        title="Volunteer Mode"
        onPress={() => router.push("/volunteer-signin")}
        style={styles.button}
      />
      <AppButton
        title="Requester Mode"
        variant="secondary"
        onPress={() => router.push("/requester")}
        style={styles.button}
      />
      <AppButton
        title="Sign Out"
        variant="secondary"
        onPress={handleSignOut}
        style={styles.signOutButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: theme.colors.background,
  },
  greeting: {
    fontSize: 13,
    color: theme.colors.mutedText,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 28,
    textAlign: "center",
  },
  button: {
    width: "100%",
    marginBottom: 12,
  },
  signOutButton: {
    width: "100%",
    marginTop: 12,
  },
});
