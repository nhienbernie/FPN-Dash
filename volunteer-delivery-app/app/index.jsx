import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function Index() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Food Pantry Delivery</Text>
      <Text style={styles.subtitle}>Supported by Volunteers</Text>
      <AppButton
        title="I Need Food"
        // TODO: Link to user sign in page here
        onPress={() => router.push("/volunteer_login_flow/volunteer-signup")}
        style={styles.button}
      />
      <AppButton
        title="I'm a Volunteer"
        variant="secondary"
        onPress={() => router.push("/volunteer_login_flow/volunteer-two-step")}
        style={styles.button}
      />
      <AppButton
        title="Volunteer Dashboard"
        onPress={() => router.push("/volunteer-dashboard")}
        style={{ marginTop: 16 }}
      />
      <AppButton
        title="Confirm Delivery (test)"
        onPress={() => router.push("/confirm-delivery")}
        style={{ marginTop: 16 }}
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
