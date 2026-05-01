import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function ModeSelectScreen() {
  return (
    <View style={styles.container}>
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Food Pantry Network</Text>
        <Text style={styles.title}>
          Coordinate food assistance for households, volunteers, and pantry teams.
        </Text>
        <Text style={styles.subtitle}>
          Choose how you want to continue to request groceries, manage deliveries,
          or oversee pantry operations.
        </Text>

        <AppButton
          title="Volunteer Portal"
          onPress={() => router.push("/volunteer-options")}
          style={styles.button}
          testID="mode-select-volunteer"
        />
        <AppButton
          title="Request Food"
          variant="secondary"
          onPress={() => router.push("/requester")}
          style={styles.button}
          testID="mode-select-requester"
        />
        <AppButton
          title="Pantry Dashboard"
          variant="ghost"
          onPress={() => router.push("/admin-dashboard")}
          style={styles.button}
          testID="mode-select-admin"
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
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.18,
  },
  glowTop: {
    top: -40,
    right: -30,
    backgroundColor: theme.colors.secondary,
  },
  glowBottom: {
    bottom: -80,
    left: -20,
    backgroundColor: theme.colors.primary,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 4,
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
    fontSize: 33,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 14,
    lineHeight: 40,
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
