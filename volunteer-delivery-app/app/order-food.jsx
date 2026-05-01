import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppButton from "../components/AppButton";
import { isCustomerOrderActive, ORDER_STATUS } from "../lib/orderStatus";
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
          .select("order_id, status, created_at")
          .eq("customer_uid", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (order && (isCustomerOrderActive(order.status) || order.status === ORDER_STATUS.DELIVERED)) {
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
      <View style={[styles.glow, styles.glowPrimary]} />
      <View style={[styles.glow, styles.glowSecondary]} />

      <View style={styles.card}>
        <Text style={styles.eyebrow}>Requester Portal</Text>
        <Text style={styles.title}>Order food assistance</Text>
        <Text style={styles.subtitle}>
          Start a delivery request for your saved address and move through the
          order steps when you&apos;re ready.
        </Text>
        <AppButton
          title="Start Order"
          onPress={() => router.push("/order-boxes")}
          style={styles.button}
          testID="order-food-start-order"
        />
        {address ? (
          <Text style={styles.address}>
            Delivering to {formatAddress(address)}.
          </Text>
        ) : null}
        <TouchableOpacity onPress={() => Linking.openURL("tel:+14437644960")}>
          <Text style={styles.link}>Need help? Tap here to contact FPN.</Text>
        </TouchableOpacity>
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
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.18,
  },
  glowPrimary: {
    top: -60,
    right: -35,
    backgroundColor: theme.colors.primary,
  },
  glowSecondary: {
    bottom: -90,
    left: -30,
    backgroundColor: theme.colors.secondary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 3,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 31,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
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
