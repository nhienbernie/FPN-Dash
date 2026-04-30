import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function VolunteerOptionsScreen() {
  return (
    <View style={styles.container}>
      <View style={[styles.glow, styles.glowPrimary]} />
      <View style={[styles.glow, styles.glowSecondary]} />

      <View style={styles.card}>
        <Text style={styles.eyebrow}>Volunteer Portal</Text>
        <Text style={styles.title}>Choose the volunteer path that fits today.</Text>
        <Text style={styles.subtitle}>
          New volunteers can create an account, and returning volunteers can jump
          right back into the dashboard.
        </Text>

        <AppButton
          title="Create Volunteer Account"
          onPress={() => router.push("/volunteer-signup")}
          style={styles.button}
          testID="volunteer-options-signup"
        />
        <AppButton
          title="Sign In"
          variant="secondary"
          onPress={() => router.push("/volunteer-signin")}
          style={styles.button}
          testID="volunteer-options-signin"
        />
        <AppButton
          title="Back Home"
          variant="ghost"
          onPress={() => router.push("/mode-select")}
          style={styles.button}
          testID="volunteer-options-back-home"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: theme.colors.background,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.18,
  },
  glowPrimary: {
    top: -50,
    left: -35,
    backgroundColor: theme.colors.primary,
  },
  glowSecondary: {
    bottom: -85,
    right: -30,
    backgroundColor: theme.colors.secondary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 3,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 31,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
  },
  button: {
    width: "100%",
    marginBottom: 12,
  },
});
