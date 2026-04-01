import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const ITEM_LABELS = {
  item_meat: "Meat",
  item_plant_protein: "Plant Protein",
  item_milk: "Milk",
  item_oj: "O.J.",
  diet_kosher: "Kosher",
  diet_vegan: "Vegan",
  diet_vegetarian: "Vegetarian",
  diet_pescatarian: "Pescatarian",
  diet_gluten_free: "Gluten Free",
};

export default function OrderStatus() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const fetchOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("orders")
        .select("order_id, status, created_at, notes, order_items(item_key)")
        .eq("customer_uid", user.id)
        .single();

      if (!error && data) setOrder(data);
    } catch (_) {
      // ignore
    } finally {
      setInitializing(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, []);

  const handleCancelOrder = async () => {
    if (!order) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("order_id", order.order_id);

      if (error) {
        Alert.alert("Error", "Failed to cancel order.");
        return;
      }

      Alert.alert("Order Cancelled", "Your order has been cancelled.");
      router.replace("/order-food");
    } catch (_) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchOrder();
    setLoading(false);
    Alert.alert("Refreshed", "Order status updated.");
  };

  if (initializing) return null;

  if (!order) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No Active Order</Text>
        <AppButton
          title="Place an Order"
          onPress={() => router.replace("/order-food")}
          style={styles.button}
        />
      </View>
    );
  }

  const selectedItems = (order.order_items ?? [])
    .map((r) => ITEM_LABELS[r.item_key] ?? r.item_key);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Status</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{order.status}</Text>

        <Text style={styles.label}>Placed At</Text>
        <Text style={styles.value}>
          {new Date(order.created_at).toLocaleString()}
        </Text>

        {selectedItems.length > 0 && (
          <>
            <Text style={styles.label}>Items</Text>
            <Text style={styles.value}>{selectedItems.join(", ")}</Text>
          </>
        )}

        {order.notes ? (
          <>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{order.notes}</Text>
          </>
        ) : null}
      </View>

      <AppButton
        title="Refresh Status"
        onPress={handleRefresh}
        disabled={loading}
        style={styles.button}
      />
      <AppButton
        title="Cancel Order"
        onPress={handleCancelOrder}
        disabled={loading}
        variant="secondary"
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
    marginBottom: 24,
    textAlign: "center",
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.mutedText + "44",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.mutedText,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: theme.colors.text,
  },
  button: {
    width: "100%",
    marginBottom: 12,
  },
});