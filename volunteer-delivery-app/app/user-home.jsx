import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function volunteerHome() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Food Pantry Delivery</Text>
      <Text style={styles.subtitle}>Customer onboarding portal</Text>
      <AppButton
        title="Customer Sign Up"
        /*onPress={() => router.push("/customer-signup")}*/
        style={styles.button}
      />
      <AppButton
        title="Customer Sign In"
        variant="secondary"
        /*onPress={() => router.push("/customer-signin")}*/
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