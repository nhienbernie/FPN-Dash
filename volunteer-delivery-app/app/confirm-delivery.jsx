import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function ConfirmDelivery() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Delivery</Text>
      {/* future content will go here */}
      <AppButton
        title="Back to dashboard"
        onPress={() => router.push("/volunteer-dashboard")}
        style={{ marginTop: theme.spacing.md }}
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
});
