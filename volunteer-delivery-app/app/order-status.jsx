import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppButton from "../components/AppButton";
import { useOrderSubscription } from "../lib/orderRealtime";
import { parseOrderNotes } from "../lib/orderSelectionWorkaround";
import {
  canCancelOrder,
  getOrderStatusMeta,
  normalizeOrderStatus,
  ORDER_PROGRESS_STAGES,
  ORDER_STATUS,
} from "../lib/orderStatus";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

function OrderProgress({ status }) {
  const normalizedStatus = normalizeOrderStatus(status);
  const currentStep = getOrderStatusMeta(normalizedStatus).stepIndex;

  return (
    <View style={styles.progressContainer}>
      {ORDER_PROGRESS_STAGES.map((stage, index) => {
        const meta = getOrderStatusMeta(stage);
        const isComplete = index <= currentStep;
        const isCurrent = index === currentStep;

        return (
          <View key={stage} style={styles.progressStep}>
            <View
              style={[
                styles.progressDot,
                {
                  backgroundColor: isComplete
                    ? meta.accentColor
                    : theme.colors.background,
                  borderColor: meta.borderColor,
                },
                isCurrent ? styles.progressDotCurrent : null,
              ]}
            />
            {index < ORDER_PROGRESS_STAGES.length - 1 ? (
              <View
                style={[
                  styles.progressLine,
                  {
                    backgroundColor: isComplete
                      ? meta.accentColor
                      : theme.colors.border,
                  },
                ]}
              />
            ) : null}
            <Text style={styles.progressLabel}>{meta.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function OrderStatus() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [address, setAddress] = useState(null);

  const formatAddress = (address) => {
    return address || "";
  };

  const applyOrder = useCallback((nextOrder) => {
    setOrder(nextOrder || null);
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        applyOrder(null);
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("order_id, status, created_at, notes")
        .eq("customer_uid", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) {
        applyOrder(data);
      }

      // Fetch address
      const { data: customer } = await supabase
        .from("customers")
        .select("address")
        .eq("uid", user.id)
        .single();
      if (customer) {
        setAddress(customer.address);
      }
    } catch (_) {
      // ignore
    } finally {
      setInitializing(false);
    }
  }, [applyOrder]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useOrderSubscription({
    orderId: order?.order_id,
    onChange: (payload) => {
      if (payload.eventType === "DELETE") {
        applyOrder(null);
        return;
      }

      fetchOrder();
    },
  });

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

  const parsedNotes = parseOrderNotes(order?.notes);
  const selectedItems = parsedNotes.selectedItems;
  const statusMeta = getOrderStatusMeta(order?.status);
  const showCancelAction = order && canCancelOrder(order.status);
  const showDeliveredActions = order?.status === ORDER_STATUS.DELIVERED;
  const disableCancelAction = order && !showCancelAction && !showDeliveredActions;

  if (!order) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No Active Order</Text>
        <AppButton
          title="Place an Order"
          onPress={() => router.replace("/order-food")}
          style={styles.button}
        />
        {address && (
          <Text style={styles.address}>delivering to {formatAddress(address)}</Text>
        )}
        <TouchableOpacity onPress={() => Linking.openURL('tel:+14437644960')}>
          <Text style={styles.link}>need help? Contact FPN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Status</Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: statusMeta.backgroundColor,
            borderColor: statusMeta.borderColor,
          },
        ]}
      >
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{statusMeta.label}</Text>
        <Text style={styles.description}>{statusMeta.description}</Text>
        <OrderProgress status={order.status} />

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

        {parsedNotes.userNotes ? (
          <>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{parsedNotes.userNotes}</Text>
          </>
        ) : null}
      </View>

      <AppButton
        title="Refresh Status"
        onPress={handleRefresh}
        disabled={loading}
        style={styles.button}
      />
      {showCancelAction ? (
        <AppButton
          title="Cancel Order"
          onPress={handleCancelOrder}
          disabled={loading}
          variant="secondary"
          style={styles.button}
        />
      ) : null}
      {disableCancelAction ? (
        <View style={styles.lockedState}>
          <Text style={styles.lockedStateText}>
            This order is already being delivered and can no longer be cancelled.
          </Text>
        </View>
      ) : null}
      {showDeliveredActions ? (
        <AppButton
          title="Order Again"
          onPress={() => router.replace("/order-items")}
          disabled={loading}
          style={styles.button}
        />
      ) : null}
      {address && (
        <Text style={styles.address}>delivering to {formatAddress(address)}</Text>
      )}
      <TouchableOpacity onPress={() => Linking.openURL('tel:+14437644960')}>
        <Text style={styles.link}>need help? Contact FPN</Text>
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
    marginBottom: 24,
    textAlign: "center",
    marginTop: 50
  },
  card: {
    width: "100%",
    borderWidth: 1,
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
  description: {
    fontSize: 15,
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 16,
  },
  button: {
    width: "100%",
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  progressStep: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    zIndex: 1,
  },
  progressDotCurrent: {
    transform: [{ scale: 1.15 }],
  },
  progressLine: {
    position: "absolute",
    top: 8,
    left: "50%",
    right: "-50%",
    height: 3,
  },
  progressLabel: {
    fontSize: 11,
    color: theme.colors.mutedText,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 2,
  },
  lockedState: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#F8FAFC",
  },
  lockedStateText: {
    fontSize: 15,
    color: theme.colors.mutedText,
    textAlign: "center",
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
    textDecorationLine: "underline",
    marginTop: 16,
    textAlign: "center",
  },
});
