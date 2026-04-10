import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

export default function OrderFood() {
  const [checking, setChecking] = useState(true);
  const [address, setAddress] = useState(null);

  const formatAddress = (address) => {
    return address || "";
  };

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

        // Fetch address
        const { data: customers } = await supabase
          .from("customers")
          .select("address")
          .eq("uid", user.id)
          .single();
        if (customers) {
          setAddress(customers.address);
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
        onPress={() => router.push("/order-boxes")}
        style={styles.button}
      />
      {address && (
        <Text style={styles.address}>Delivering to {formatAddress(address)}.</Text>
      )}
      <TouchableOpacity onPress={() => Linking.openURL('tel:+14437644960')}>
        <Text style={styles.link}>Need help? Tap here to contact FPN.</Text>
      </TouchableOpacity>
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
  },
  address: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginTop: 16,
    textAlign: "center",
  },
  link: {
    fontSize: 16,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    marginTop: 16,
    textAlign: "center",
  },
});
