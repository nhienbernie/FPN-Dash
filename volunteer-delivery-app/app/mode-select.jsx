import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function ModeSelectScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>FPN Delivery App Serving Licking County</Text>

      <AppButton
        title="Volunteer Mode"
        onPress={() => router.push("/volunteer-options")}
        style={styles.button}
      />
      <AppButton
        title="Requester Mode"
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
    marginBottom: 8,
    textAlign: "center",
    marginTop: 50
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
