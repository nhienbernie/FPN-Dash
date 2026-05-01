import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export default function VolunteerMapView() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🗺</Text>
      <Text style={styles.title}>Map view is available on the mobile app</Text>
      <Text style={styles.subtitle}>
        Open this app on an iOS or Android device to see available orders on a live map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
});
