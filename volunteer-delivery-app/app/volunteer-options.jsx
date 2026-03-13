import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function VolunteerOptionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Volunteer Portal</Text>
      <Text style={styles.subtitle}>Are you a new or returning volunteer?</Text>

      <AppButton
        title="New?"
        onPress={() => router.push("/volunteer-signup")}
        style={styles.button}
      />
      <AppButton
        title="Returning?"
        variant="secondary"
        onPress={() => router.push("/volunteer-signin")}
        style={styles.button}
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
});
