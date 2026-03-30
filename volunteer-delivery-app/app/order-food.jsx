import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

export default function OrderFood() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkExistingOrder = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: order } = await supabase
          .from("orders")
          .select("order_id")
          .eq("customer_uid", user.id)
          .single();

        if (order) {
          // Already has an active order — skip straight to status
          router.replace("/order-status");
        }
      } catch (_) {
        // No order found, stay on this screen
      } finally {
        setChecking(false);
      }
    };
    checkExistingOrder();
  }, []);

  if (checking) {
    return (
      <View style={styles.container}>
        <Text style={{ color: theme.colors.mutedText }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Food</Text>
      <Text style={styles.subtitle}>Place your food order here</Text>
      <AppButton
        title="Order Food"
        onPress={() => router.push("/order-items")}
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
  },
});
