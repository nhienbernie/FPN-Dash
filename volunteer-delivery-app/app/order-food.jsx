import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { supabase } from "../lib/supabase";
import { theme } from "../theme";

export default function OrderFood() {
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderTime, setOrderTime] = useState(null);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);
  useEffect(() => {
    const checkExistingOrder = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: order, error } = await supabase
          .from("orders")
          .select("order_id, status, created_at")
          .eq("customer_uid", user.id)
          .single();

        if (order && !error) {
          setOrderId(order.order_id);
          setOrderTime(new Date(order.created_at));
          setOrderStatus(order.status);
          setOrderPlaced(true);
        }
      } catch (_error) {
        // Ignore errors on load
      }
    };
    checkExistingOrder();
  }, []);

  const [loading, setLoading] = useState(false);

  const handleOrderFood = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "User not authenticated.");
        setLoading(false);
        return;
      }

      // Fetch user data from customers table
      const { data: customer, error: fetchError } = await supabase
        .from("customers")
        .select("uid, first_name, last_name, address")
        .eq("uid", user.id)
        .single();

      if (fetchError || !customer) {
        Alert.alert("Error", "Failed to fetch user data.");
        setLoading(false);
        return;
      }

      // Insert new order
      const { data: order, error: insertError } = await supabase
        .from("orders")
        .insert({
          customer_uid: customer.uid,
          name: customer.first_name,
          delivery_address: customer.address,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          Alert.alert("Error", "You already have an active order.");
        } else {
          Alert.alert("Error", "Failed to place order.");
        }
        setLoading(false);
        return;
      }

      setOrderId(order.order_id);
      setOrderTime(new Date(order.created_at));
      setOrderStatus(order.status);
      setOrderPlaced(true);
      Alert.alert("Order Placed", "Your food order has been placed successfully!");
    } catch (_error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("order_id", orderId);

      if (error) {
        Alert.alert("Error", "Failed to cancel order.");
        setLoading(false);
        return;
      }

      setOrderPlaced(false);
      setOrderId(null);
      setOrderTime(null);
      setOrderStatus("pending");
      Alert.alert("Order Cancelled", "Your order has been cancelled.");
    } catch (_error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshOrder = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select("status, created_at")
        .eq("order_id", orderId)
        .single();

      if (error || !order) {
        Alert.alert("Error", "Failed to refresh order.");
        setLoading(false);
        return;
      }

      setOrderStatus(order.status);
      setOrderTime(new Date(order.created_at));
      Alert.alert("Order Refreshed", "Your order status has been updated.");
    } catch (_error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Food</Text>
      <Text style={styles.subtitle}>Place your food order here</Text>
      {!orderPlaced ? (
        <AppButton
          title="Order Food"
          onPress={handleOrderFood}
          disabled={loading}
          style={styles.button}
        />
      ) : (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Order placed at: {orderTime ? orderTime.toLocaleString() : ""}
          </Text>
          <Text style={styles.statusText}>Status: {orderStatus}</Text>
          <AppButton
            title="Cancel Order"
            onPress={handleCancelOrder}
            disabled={loading}
            variant="secondary"
            style={styles.button}
          />
          <AppButton
            title="Refresh Order"
            onPress={handleRefreshOrder}
            disabled={loading}
            style={styles.button}
          />
        </View>
      )}
      {loading && <Text style={styles.loadingText}>Processing...</Text>}
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
  statusContainer: {
    alignItems: "center",
    width: "100%",
  },
  statusText: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.primary,
    textAlign: "center",
    marginTop: 16,
  },
});
