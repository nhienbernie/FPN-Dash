import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { lookupAddress } from "../services/geocode";
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

export default function OrderStatus() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [address, setAddress] = useState(null);
  const [customerLocation, setCustomerLocation] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [etaUpdating, setEtaUpdating] = useState(false);
  const [etaMessage, setEtaMessage] = useState("");

  const applyOrder = useCallback((order) => {
    setOrder(order ? normalizeOrder(order) : null);
  }, []);

  const formatAddress = (address) => {
    return address || "";
  };

  const fetchLatestOrder = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        applyOrder(null);
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("order_id, status, created_at, notes, box_count, boxes(box_id, box_number, order_items(item_id, items(label))), delivery_address, volunteer_uid")
        .eq("customer_uid", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching latest order:", error);
        return;
      }

      applyOrder(data);

      // Fetch address
      const { data: customer } = await supabase
        .from("customers")
        .select("address")
        .eq("uid", user.id)
        .single();
      if (customer) {
        setAddress(customer.address);
      }
    } catch (error) {
      console.error("Error in fetchLatestOrder:", error);
    } finally {
      setInitializing(false);
    }
  }, [applyOrder]);

  useEffect(() => {
    fetchLatestOrder();
  }, [fetchLatestOrder]);

  useOrderSubscription({
    orderId: order?.order_id,
    onChange: (payload) => {
      if (payload.eventType === "DELETE") {
        applyOrder(null);
        return;
      }

      applyOrder(payload.new);
    },
  });

  useEffect(() => {
    let mounted = true;
    const resolveAddress = async () => {
      if (!order?.delivery_address) {
        setCustomerLocation(null);
        return;
      }
      const coords = await lookupAddress(order.delivery_address);
      if (mounted) {
        setCustomerLocation(coords);
        if (!coords) {
          setEtaMessage("Unable to resolve delivery address.");
        }
      }
    };
    resolveAddress();
    return () => {
      mounted = false;
    };
  }, [order?.delivery_address]);

  // TODO: Re-enable ETA functionality when volunteer_lat and volunteer_long columns are added to orders table
  // useEffect(() => {
  //   let mounted = true;
  //   let interval = null;
  //
  //   const updateEta = async () => {
  //     if (!order) {
  //       setEtaMinutes(null);
  //       setEtaMessage("");
  //       return;
  //     }
  //
  //     if (order.status === ORDER_STATUS.PENDING || !order.volunteer_uid) {
  //       setEtaMinutes(null);
  //       setEtaMessage("Waiting for volunteer assignment.");
  //       return;
  //     }
  //
  //     if (!customerLocation) {
  //       setEtaMinutes(null);
  //       setEtaMessage("Looking up delivery address...");
  //       return;
  //     }
  //
  //     const { lat: volunteerLat, lng: volunteerLng } = getVolunteerCoordinates(order);
  //     if (!isValidCoordinate(volunteerLat) || !isValidCoordinate(volunteerLng)) {
  //       setEtaMinutes(null);
  //       setEtaMessage("Volunteer location not available yet.");
  //       return;
  //     }
  //
  //     setEtaUpdating(true);
  //     const minutes = await calculateEtaMinutes(
  //       volunteerLat,
  //       volunteerLng,
  //       customerLocation.latitude,
  //       customerLocation.longitude
  //     );
  //     if (!mounted) return;
  //
  //     if (minutes == null) {
  //       setEtaMinutes(null);
  //       setEtaMessage("Unable to estimate arrival time yet.");
  //     } else {
  //       setEtaMinutes(minutes);
  //       setEtaMessage("");
  //     }
  //     setEtaUpdating(false);
  //   };
  //
  //   updateEta();
  //   if (order && order.status !== ORDER_STATUS.DELIVERED) {
  //     interval = setInterval(updateEta, 20000);
  //   }
  //
  //   return () => {
  //     mounted = false;
  //     if (interval) clearInterval(interval);
  //   };
  // }, [order?.order_id, order?.status, order?.volunteer_uid, customerLocation]);

  const isValidCoordinate = (value) =>
    typeof value === "number" && Number.isFinite(value) && value !== 0;

  const getVolunteerCoordinates = (order) => {
    const lat =
      order?.volunteer_lat != null
        ? Number(order.volunteer_lat)
        : Number(order?.volunter_lat);
    const lng =
      order?.volunteer_long != null
        ? Number(order.volunteer_long)
        : Number(order?.volunter_long);
    return { lat, lng };
  };

  const calculateEtaMinutes = async (
    volunteerLat,
    volunteerLng,
    customerLat,
    customerLng
  ) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${volunteerLng},${volunteerLat};${customerLng},${customerLat}?overview=false&alternatives=false&annotations=duration`;
      const res = await fetch(url);
      const data = await res.json();
      const seconds = data?.routes?.[0]?.duration;
      if (!seconds || !Number.isFinite(seconds)) return null;
      return Math.max(0, Math.ceil(seconds / 60));
    } catch (error) {
      console.error("Error fetching ETA from OSRM:", error);
      return null;
    }
  };

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
    await fetchLatestOrder();
    setLoading(false);
    Alert.alert("Refreshed", "Order status updated.");
  };

  const statusMeta = useMemo(
    () => getOrderStatusMeta(order?.status),
    [order?.status]
  );
  const orderTime = order?.created_at
    ? new Date(order.created_at)
    : null;
  const showDeliveredActions = order?.status === ORDER_STATUS.DELIVERED;
  const showCancelAction = order && canCancelOrder(order.status);
  const disableCancelAction =
    order && !showCancelAction && !showDeliveredActions;

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
        {address && (
          <Text style={styles.address}>delivering to {formatAddress(address)}</Text>
        )}
        <TouchableOpacity onPress={() => Linking.openURL('tel:+14437644960')}>
          <Text style={styles.link}>need help? Contact FPN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const boxes = [...(order.boxes ?? [])].sort(
    (a, b) => a.box_number - b.box_number
  );
  const multiBox = boxes.length > 1;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Status</Text>

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
        {/* TODO: Re-enable ETA display when volunteer location tracking is available */}
        {/* <Text style={styles.etaText}>
          {etaUpdating
            ? "Estimating driver arrival..."
            : etaMinutes != null
            ? `Driver ETA: ${etaMinutes} min`
            : etaMessage}
        </Text> */}
        <OrderProgress status={order.status} />
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
          onPress={() => router.replace("/order-food")}
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
  statusCard: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    width: "100%",
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
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  etaText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: "600",
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
  button: {
    width: "100%",
    marginBottom: 12,
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