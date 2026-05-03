import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppButton from "../components/AppButton";
import ReportConcernModal from "../components/ReportConcernModal";
import {
  calculateDistanceMiles,
  estimateTravelMinutes,
  formatDistanceMiles,
  formatEtaMinutes,
  hasCoordinates,
} from "../lib/deliveryTracking";
import { deleteOrderById } from "../lib/orderDeletion";
import { useOrderSubscription } from "../lib/orderRealtime";
import { parseOrderNotes } from "../lib/orderSelectionWorkaround";
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
    <View style={styles.progressWrapper}>
      <View style={styles.progressContainer}>
        {ORDER_PROGRESS_STAGES.map((stage, index) => {
          const meta = getOrderStatusMeta(stage);
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          const dotBg = isDone
            ? theme.colors.primary
            : isCurrent
            ? theme.colors.primary
            : theme.colors.background;
          const dotBorder = isUpcoming ? theme.colors.border : theme.colors.primary;

          return (
            <View key={stage} style={styles.progressStep}>
              {index < ORDER_PROGRESS_STAGES.length - 1 ? (
                <View
                  style={[
                    styles.progressLine,
                    {
                      backgroundColor: isDone
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.progressDot,
                  { backgroundColor: dotBg, borderColor: dotBorder },
                  isCurrent ? styles.progressDotCurrent : null,
                ]}
              >
                {isDone ? (
                  <Text style={styles.progressDotCheck}>✓</Text>
                ) : (
                  <Text
                    style={[
                      styles.progressDotNumber,
                      { color: isCurrent ? theme.colors.primaryText : theme.colors.mutedText },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  isCurrent ? styles.progressLabelActive : null,
                ]}
              >
                {meta.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function OrderStatus() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [address, setAddress] = useState(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [deliveryEstimate, setDeliveryEstimate] = useState({
    state: "idle",
  });

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

      fetchLatestOrder();
    },
  });

  const handleCancelOrder = async () => {
    if (!order) return;
    setLoading(true);
    try {
      await deleteOrderById(order.order_id);

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
  const parsedNotes = useMemo(() => parseOrderNotes(order?.notes), [order?.notes]);
  const volunteerCoords = parsedNotes.tracking?.volunteerCoords ?? null;
  const deliveryProof = parsedNotes.deliveryProof;
  const orderTime = order?.created_at
    ? new Date(order.created_at)
    : null;
  const showDeliveredActions = order?.status === ORDER_STATUS.DELIVERED;
  const showCancelAction = order && canCancelOrder(order.status);
  const disableCancelAction =
    order && !showCancelAction && !showDeliveredActions;
  const canReportVolunteer = Boolean(order?.order_id && order?.volunteer_uid);

  useEffect(() => {
    let cancelled = false;

    const loadDeliveryEstimate = async () => {
      if (!order) {
        setDeliveryEstimate({ state: "idle" });
        return;
      }

      if (order.status === ORDER_STATUS.PENDING) {
        setDeliveryEstimate({ state: "waiting_volunteer" });
        return;
      }

      if (order.status === ORDER_STATUS.DELIVERED) {
        setDeliveryEstimate({ state: "delivered" });
        return;
      }

      if (!hasCoordinates(volunteerCoords)) {
        setDeliveryEstimate({ state: "waiting_location" });
        return;
      }

      setDeliveryEstimate({ state: "loading" });

      const deliveryCoords = await lookupAddress(order.delivery_address || address);
      if (cancelled) {
        return;
      }

      if (!hasCoordinates(deliveryCoords)) {
        setDeliveryEstimate({ state: "address_unavailable" });
        return;
      }

      const distanceMiles = calculateDistanceMiles(volunteerCoords, deliveryCoords);
      const etaMinutes = estimateTravelMinutes(distanceMiles);

      setDeliveryEstimate({
        state: "ready",
        distanceMiles,
        etaMinutes,
        capturedAt: volunteerCoords.capturedAt,
      });
    };

    loadDeliveryEstimate();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    order,
    volunteerCoords,
  ]);

  if (initializing) return null;

  if (!order) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No Active Order</Text>
        <AppButton
          title="Place an Order"
          onPress={() => router.replace("/order-food")}
          style={styles.button}
          testID="order-status-place-order"
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
  const boxDetails = boxes.map((box) => ({
    boxNumber: box.box_number,
    items: (box.order_items ?? [])
      .map((entry) => entry.items?.label)
      .filter(Boolean),
  }));
  const selectedItems = parsedNotes.selectedItems;
  const noteText = parsedNotes.userNotes;

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
        <Text testID="order-status-current-status" style={styles.statusLabel}>
          Status: {statusMeta.label}
        </Text>
        <Text style={styles.statusDescription}>{statusMeta.description}</Text>
        <OrderProgress status={order.status} />

        {order.status === ORDER_STATUS.DELIVERED && deliveryProof?.photoUri ? (
          <View style={styles.detailSection} testID="order-status-delivery-proof">
            <Text style={styles.detailSectionTitle}>Delivery Proof</Text>
            {deliveryProof.capturedAt ? (
              <Text style={styles.detailText}>
                Photo captured: {new Date(deliveryProof.capturedAt).toLocaleString()}
              </Text>
            ) : null}
            <Image source={{ uri: deliveryProof.photoUri }} style={styles.proofImage} />
          </View>
        ) : null}

        {deliveryEstimate.state !== "delivered" ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Delivery ETA</Text>
            {deliveryEstimate.state === "ready" ? (
              <>
                <Text style={styles.detailHeading}>
                  Volunteer is {formatDistanceMiles(deliveryEstimate.distanceMiles)} away
                </Text>
                <Text style={styles.detailText}>
                  Estimated arrival: {formatEtaMinutes(deliveryEstimate.etaMinutes)}
                </Text>
                {deliveryEstimate.capturedAt ? (
                  <Text style={styles.detailText}>
                    Last updated:{" "}
                    {new Date(deliveryEstimate.capturedAt).toLocaleTimeString()}
                  </Text>
                ) : null}
              </>
            ) : null}
            {deliveryEstimate.state === "waiting_volunteer" ? (
              <Text style={styles.detailText}>
                We&apos;ll show distance and ETA once a volunteer accepts your order.
              </Text>
            ) : null}
            {deliveryEstimate.state === "waiting_location" ? (
              <Text style={styles.detailText}>
                A volunteer accepted your order. ETA will appear after they share
                their current location.
              </Text>
            ) : null}
            {deliveryEstimate.state === "loading" ? (
              <Text style={styles.detailText}>
                Calculating the latest delivery distance...
              </Text>
            ) : null}
            {deliveryEstimate.state === "address_unavailable" ? (
              <Text style={styles.detailText}>
                We couldn&apos;t calculate the route for this delivery address yet.
              </Text>
            ) : null}
          </View>
        ) : null}

        {boxDetails.length > 0 ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Order Details</Text>
            {boxDetails.map((box) => (
              <View key={box.boxNumber} style={styles.detailBlock}>
                <Text style={styles.detailHeading}>
                  {boxDetails.length > 1 ? `Box ${box.boxNumber}` : "Items"}
                </Text>
                <Text style={styles.detailText}>
                  {box.items.length > 0 ? box.items.join(", ") : "No items selected"}
                </Text>
              </View>
            ))}
          </View>
        ) : selectedItems.length > 0 ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Order Details</Text>
            <View style={styles.detailBlock}>
              <Text style={styles.detailHeading}>Items</Text>
              <Text style={styles.detailText}>{selectedItems.join(", ")}</Text>
            </View>
          </View>
        ) : null}

        {noteText ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Special Instructions</Text>
            <Text style={styles.detailText}>{noteText}</Text>
          </View>
        ) : null}
      </View>

      <AppButton
        title="Refresh Order"
        onPress={handleRefresh}
        disabled={loading}
        style={styles.button}
        testID="order-status-refresh"
      />

      {showCancelAction ? (
        <AppButton
          title="Cancel Order"
          onPress={handleCancelOrder}
          disabled={loading}
          variant="secondary"
          style={styles.button}
          testID="order-status-cancel"
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
          testID="order-status-order-again"
        />
      ) : null}

      {canReportVolunteer ? (
        <AppButton
          title="Report Concern"
          onPress={() => setReportModalVisible(true)}
          disabled={loading}
          variant="secondary"
          style={styles.button}
        />
      ) : null}

      {address && (
        <Text style={styles.address}>delivering to {formatAddress(address)}</Text>
      )}
      <TouchableOpacity onPress={() => Linking.openURL('tel:+14437644960')}>
        <Text style={styles.link}>need help? Contact FPN</Text>
      </TouchableOpacity>

      <ReportConcernModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        orderId={order?.order_id}
        reportedId={order?.volunteer_uid}
        reporterRole="requester"
        reportedRole="volunteer"
        subjectLabel="volunteer"
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
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  progressWrapper: {
    marginVertical: theme.spacing.md,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  progressStep: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  progressDotCurrent: {
    width: 32,
    height: 32,
    borderRadius: 16,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  progressDotCheck: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryText,
  },
  progressDotNumber: {
    fontSize: 12,
    fontWeight: "700",
  },
  progressLine: {
    position: "absolute",
    top: 13,
    left: "50%",
    right: "-50%",
    height: 3,
    borderRadius: 2,
    zIndex: 0,
  },
  progressLabel: {
    fontSize: 11,
    color: theme.colors.mutedText,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  progressLabelActive: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 12,
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
  detailSection: {
    marginTop: theme.spacing.lg,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailBlock: {
    marginBottom: theme.spacing.sm,
  },
  detailHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  proofImage: {
    width: "100%",
    height: 180,
    borderRadius: theme.radius.md,
    resizeMode: "cover",
    backgroundColor: theme.colors.surfaceMuted,
    marginTop: theme.spacing.sm,
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
