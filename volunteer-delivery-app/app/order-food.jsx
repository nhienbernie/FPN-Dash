import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import AppButton from "../components/AppButton";
import { useOrderSubscription } from "../lib/orderRealtime";
import {
  canCancelOrder,
  getOrderStatusMeta,
  normalizeOrder,
  normalizeOrderStatus,
  ORDER_PROGRESS_STAGES,
  ORDER_STATUS,
} from "../lib/orderStatus";
import { supabase } from "../lib/supabase";
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
                  backgroundColor: isComplete ? meta.accentColor : theme.colors.background,
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

export default function OrderFood() {
  const [currentOrder, setCurrentOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyOrder = useCallback((order) => {
    setCurrentOrder(order ? normalizeOrder(order) : null);
  }, []);

  const fetchLatestOrder = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      applyOrder(null);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("order_id, status, created_at, customer_uid, volunteer_uid")
      .eq("customer_uid", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching latest order:", error);
      return;
    }

    applyOrder(data);
  }, [applyOrder]);

  useEffect(() => {
    fetchLatestOrder();
  }, [fetchLatestOrder]);

  useOrderSubscription({
    orderId: currentOrder?.order_id,
    onChange: (payload) => {
      if (payload.eventType === "DELETE") {
        applyOrder(null);
        return;
      }

      applyOrder(payload.new);
    },
  });

  const handleOrderFood = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "User not authenticated.");
        return;
      }

      const { data: customer, error: fetchError } = await supabase
        .from("customers")
        .select("uid, first_name, last_name, address")
        .eq("uid", user.id)
        .single();

      if (fetchError || !customer) {
        Alert.alert("Error", "Failed to fetch user data.");
        return;
      }

      const { data: order, error: insertError } = await supabase
        .from("orders")
        .insert({
          customer_uid: customer.uid,
          name: customer.first_name,
          delivery_address: customer.address,
          status: ORDER_STATUS.PENDING,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          Alert.alert("Error", "You already have an active order.");
        } else {
          Alert.alert("Error", "Failed to place order.");
        }
        return;
      }

      applyOrder(order);
      Alert.alert("Order Placed", "Your food order has been placed successfully!");
    } catch (_error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!currentOrder?.order_id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("order_id", currentOrder.order_id);

      if (error) {
        Alert.alert("Error", "Failed to cancel order.");
        return;
      }

      applyOrder(null);
      Alert.alert("Order Cancelled", "Your order has been cancelled.");
    } catch (_error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const statusMeta = useMemo(
    () => getOrderStatusMeta(currentOrder?.status),
    [currentOrder?.status]
  );
  const orderTime = currentOrder?.created_at
    ? new Date(currentOrder.created_at)
    : null;
  const showDeliveredActions = currentOrder?.status === ORDER_STATUS.DELIVERED;
  const showCancelAction = currentOrder && canCancelOrder(currentOrder.status);
  const disableCancelAction =
    currentOrder && !showCancelAction && !showDeliveredActions;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Food</Text>
      <Text style={styles.subtitle}>Place your food order here</Text>
      {!currentOrder ? (
        <AppButton
          title="Order Food"
          onPress={handleOrderFood}
          disabled={loading}
          style={styles.button}
        />
      ) : (
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: statusMeta.backgroundColor,
                borderColor: statusMeta.borderColor,
              },
            ]}
          >
            <Text style={styles.statusTimestamp}>
              Order placed at: {orderTime ? orderTime.toLocaleString() : ""}
            </Text>
            <Text style={styles.statusLabel}>Status: {statusMeta.label}</Text>
            <Text style={styles.statusDescription}>{statusMeta.description}</Text>
            <OrderProgress status={currentOrder.status} />
          </View>

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
              onPress={handleOrderFood}
              disabled={loading}
              style={styles.button}
            />
          ) : null}
        </View>
      )}
      {loading ? <Text style={styles.loadingText}>Processing...</Text> : null}
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
    alignItems: "stretch",
    width: "100%",
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  statusTimestamp: {
    fontSize: 14,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  statusLabel: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  statusDescription: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  progressStep: {
    flex: 1,
    alignItems: "center",
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    marginBottom: theme.spacing.sm,
  },
  progressDotCurrent: {
    transform: [{ scale: 1.12 }],
  },
  progressLine: {
    position: "absolute",
    top: 8,
    left: "50%",
    right: "-50%",
    height: 2,
    zIndex: -1,
  },
  progressLabel: {
    fontSize: 12,
    color: theme.colors.mutedText,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  lockedState: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  lockedStateText: {
    color: theme.colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.primary,
    textAlign: "center",
    marginTop: 16,
  },
});
