import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function ModeSelectScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to the FPN Delivery App Serving Licking County!</Text>
      <Text style={styles.subtitle}>Please select your mode to get started:</Text>

      <AppButton
        title="I'm a Volunteer"
        onPress={() => router.push("/volunteer-options")}
        style={styles.button}
      />
      <AppButton
        title="I Need Food"
        variant="secondary"
        onPress={() => router.push("/requester")}
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
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 20,
    textAlign: "center",
    marginTop: 50
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 20,
    textAlign: "center",
  },
  button: {
    width: "100%",
    marginBottom: 12,
  },
});
