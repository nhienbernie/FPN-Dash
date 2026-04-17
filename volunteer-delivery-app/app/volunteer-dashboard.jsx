import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { useOrdersFeedSubscription } from "../lib/orderRealtime";
import {
  parseOrderNotes,
  updateOrderTracking,
} from "../lib/orderSelectionWorkaround";
import {
  ACTIVE_VOLUNTEER_STATUSES,
  canTransition,
  getOrderStatusMeta,
  normalizeOrder,
  ORDER_STATUS,
} from "../lib/orderStatus";
import { supabase } from "../services/supabase";
import { ensureVolunteerProfile } from "../lib/volunteerProfile";
import { theme } from "../theme";

export default function VolunteerDashboard() {
  const [availableOrders, setAvailableOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState(null);
  const [hasVolunteerProfile, setHasVolunteerProfile] = useState(true);
  const [profileMessage, setProfileMessage] = useState("");
  const [locationSyncMessage, setLocationSyncMessage] = useState("");
  const router = useRouter();

  const buildTrackedNotes = useCallback(async (notes, statusToShare) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setLocationSyncMessage(
          "Location access is off, so requester ETA updates are unavailable.",
        );
        return notes;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocationSyncMessage("Requester ETA updated from your current location.");

      return updateOrderTracking(notes, {
        volunteerCoords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          capturedAt: new Date().toISOString(),
          sharedForStatus: statusToShare,
        },
      });
    } catch (error) {
      console.error("Error capturing volunteer location:", error);
      setLocationSyncMessage("We could not refresh your location just now.");
      return notes;
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Error fetching volunteer session:", userError);
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const volunteerProfileResult = await ensureVolunteerProfile({
      supabase,
      user,
    });

    if (
      volunteerProfileResult.status === "error" ||
      volunteerProfileResult.status === "incomplete"
    ) {
      console.error(
        "Error ensuring volunteer profile:",
        volunteerProfileResult.message,
      );
      setHasVolunteerProfile(false);
      setProfileMessage(
        volunteerProfileResult.message ||
          "This account does not have a matching volunteer profile yet.",
      );
      setAvailableOrders([]);
      setActiveOrder(null);
      setLoading(false);
      return;
    }

    setHasVolunteerProfile(true);
    setProfileMessage(
      volunteerProfileResult.status === "created"
        ? "We restored your volunteer profile automatically."
        : "",
    );

    const [
      { data: pendingOrders, error: pendingError },
      { data: volunteerOrder, error: volunteerError },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("status", ORDER_STATUS.PENDING)
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("*")
        .eq("volunteer_uid", user.id)
        .in("status", ACTIVE_VOLUNTEER_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (pendingError || volunteerError) {
      console.error("Error fetching orders:", pendingError || volunteerError);
      setLoading(false);
      return;
    }

    setAvailableOrders((pendingOrders || []).map(normalizeOrder));
    setActiveOrder(volunteerOrder ? normalizeOrder(volunteerOrder) : null);
    if (!volunteerOrder) {
      setLocationSyncMessage("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useOrdersFeedSubscription({
    volunteerUid: userId,
    onChange: () => {
      fetchOrders();
    },
  });

  const acceptDisabled = useMemo(
    () => Boolean(activeOrder) || submitting,
    [activeOrder, submitting],
  );

  const handleAcceptOrder = async () => {
    if (!selectedOrder || !userId) return;

    if (!hasVolunteerProfile) {
      Alert.alert(
        "Volunteer Profile Missing",
        "This signed-in account does not have a matching volunteer profile in the database. Please sign up as a volunteer first, or use a volunteer account that already has a saved profile.",
      );
      return;
    }

    if (activeOrder) {
      Alert.alert(
        "Active Delivery In Progress",
        "Finish your current delivery before accepting another order.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const nextNotes = await buildTrackedNotes(
        selectedOrder.notes,
        ORDER_STATUS.ACCEPTED,
      );

      const { data, error } = await supabase
        .from("orders")
        .update({
          status: ORDER_STATUS.ACCEPTED,
          volunteer_uid: userId,
          notes: nextNotes,
        })
        .eq("order_id", selectedOrder.order_id)
        .eq("status", ORDER_STATUS.PENDING)
        .is("volunteer_uid", null)
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Error accepting order:", error);
        Alert.alert("Error", "Unable to accept this order right now.");
        return;
      }

      if (!data) {
        Alert.alert(
          "Order Unavailable",
          "Another volunteer already accepted this order.",
        );
        return;
      }

      setSelectedOrder(null);
      fetchOrders();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceActiveOrder = async (nextStatus) => {
    if (!activeOrder || !userId) return;

    if (!canTransition(activeOrder.status, nextStatus)) {
      Alert.alert(
        "Invalid Status Change",
        "That delivery update is not allowed.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const nextNotes =
        nextStatus === ORDER_STATUS.DELIVERED
          ? activeOrder.notes
          : await buildTrackedNotes(activeOrder.notes, nextStatus);

      const { data, error } = await supabase
        .from("orders")
        .update({
          status: nextStatus,
          notes: nextNotes,
        })
        .eq("order_id", activeOrder.order_id)
        .eq("volunteer_uid", userId)
        .eq("status", activeOrder.status)
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Error updating active order:", error);
        Alert.alert("Error", "Unable to update the delivery right now.");
        return;
      }

      if (!data) {
        Alert.alert(
          "Order Changed",
          "This delivery changed in another session. Refreshing your dashboard.",
        );
      }

      fetchOrders();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncActiveLocation = async () => {
    if (!activeOrder || !userId) return;

    setSubmitting(true);
    try {
      const nextNotes = await buildTrackedNotes(activeOrder.notes, activeOrder.status);

      if (nextNotes === activeOrder.notes) {
        return;
      }

      const { error } = await supabase
        .from("orders")
        .update({ notes: nextNotes })
        .eq("order_id", activeOrder.order_id)
        .eq("volunteer_uid", userId)
        .eq("status", activeOrder.status);

      if (error) {
        console.error("Error refreshing volunteer ETA:", error);
        Alert.alert("Error", "Unable to refresh the requester ETA right now.");
        return;
      }

      fetchOrders();
    } finally {
      setSubmitting(false);
    }
  };

  const openDeliveryDetails = () => {
    if (!activeOrder) return;

    router.push({
      pathname: "/confirm-delivery",
      params: {
        name: activeOrder.name,
        address: activeOrder.delivery_address,
        order: JSON.stringify(activeOrder),
      },
    });
  };

  const renderAvailableOrder = (order) => {
    const statusMeta = getOrderStatusMeta(order.status);
    const parsedNotes = parseOrderNotes(order.notes);

    return (
      <View
        key={order.order_id}
        style={[
          styles.orderCard,
          {
            backgroundColor: statusMeta.backgroundColor,
            borderColor: statusMeta.borderColor,
          },
        ]}
      >
        <Text style={styles.orderName}>{order.name}</Text>
        <Text style={styles.orderMeta}>
          Requested:{" "}
          {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
        </Text>
        <Text style={styles.orderMeta}>Status: {statusMeta.label}</Text>
        {parsedNotes.selectedItems.length > 0 ? (
          <Text style={styles.orderMeta}>
            Items: {parsedNotes.selectedItems.join(", ")}
          </Text>
        ) : null}
        <AppButton
          title={acceptDisabled ? "Finish active delivery first" : "Accept"}
          variant={acceptDisabled ? "secondary" : "primary"}
          disabled={acceptDisabled}
          onPress={() => setSelectedOrder(order)}
          style={styles.cardButton}
        />
      </View>
    );
  };

  const activeStatusMeta = getOrderStatusMeta(activeOrder?.status);
  const activeParsedNotes = parseOrderNotes(activeOrder?.notes);
  const activeTracking = activeParsedNotes.tracking?.volunteerCoords;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Volunteer Dashboard</Text>
        {hasVolunteerProfile && profileMessage ? (
          <Text style={styles.emptyText}>{profileMessage}</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Active Delivery</Text>
          {loading ? (
            <Text style={styles.emptyText}>Loading your delivery status...</Text>
          ) : !hasVolunteerProfile ? (
            <Text style={styles.emptyText}>
              {profileMessage ||
                "This account is signed in, but it does not have a matching volunteer profile in the database yet."}
            </Text>
          ) : activeOrder ? (
            <View
              style={[
                styles.activeCard,
                {
                  backgroundColor: activeStatusMeta.backgroundColor,
                  borderColor: activeStatusMeta.borderColor,
                },
              ]}
            >
              <Text style={styles.orderName}>{activeOrder.name}</Text>
              <Text style={styles.orderMeta}>Status: {activeStatusMeta.label}</Text>
              <Text style={styles.orderMeta}>
                Address: {activeOrder.delivery_address}
              </Text>
              {activeParsedNotes.selectedItems.length > 0 ? (
                <Text style={styles.orderMeta}>
                  Items: {activeParsedNotes.selectedItems.join(", ")}
                </Text>
              ) : null}
              {activeParsedNotes.userNotes ? (
                <Text style={styles.orderMeta}>
                  Notes: {activeParsedNotes.userNotes}
                </Text>
              ) : null}
              {activeTracking?.capturedAt ? (
                <Text style={styles.orderMeta}>
                  ETA last updated:{" "}
                  {new Date(activeTracking.capturedAt).toLocaleTimeString()}
                </Text>
              ) : null}
              <Text style={styles.orderHint}>{activeStatusMeta.description}</Text>
              {locationSyncMessage ? (
                <Text style={styles.orderHint}>{locationSyncMessage}</Text>
              ) : null}
              <AppButton
                title="View Delivery Details"
                onPress={openDeliveryDetails}
                variant="secondary"
                style={styles.cardButton}
              />
              {ACTIVE_VOLUNTEER_STATUSES.includes(activeOrder.status) ? (
                <AppButton
                  title="Update ETA"
                  onPress={handleSyncActiveLocation}
                  disabled={submitting}
                  variant="secondary"
                  style={styles.cardButton}
                />
              ) : null}
              {activeOrder.status === ORDER_STATUS.ACCEPTED ? (
                <AppButton
                  title="Start Delivery"
                  onPress={() => handleAdvanceActiveOrder(ORDER_STATUS.IN_TRANSIT)}
                  disabled={submitting}
                  style={styles.cardButton}
                />
              ) : null}
              {activeOrder.status === ORDER_STATUS.IN_TRANSIT ? (
                <AppButton
                  title="Mark Delivered"
                  onPress={() => handleAdvanceActiveOrder(ORDER_STATUS.DELIVERED)}
                  disabled={submitting}
                  style={styles.cardButton}
                />
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              You do not have an active delivery right now.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Orders</Text>
          {loading ? (
            <Text style={styles.emptyText}>Loading available orders...</Text>
          ) : !hasVolunteerProfile ? (
            <Text style={styles.emptyText}>
              Order acceptance is disabled until this account has a matching
              volunteer profile.
            </Text>
          ) : availableOrders.length > 0 ? (
            availableOrders.map(renderAvailableOrder)
          ) : (
            <Text style={styles.emptyText}>No pending orders are waiting right now.</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedOrder)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Acceptance</Text>
            {selectedOrder ? (
              (() => {
                const parsedNotes = parseOrderNotes(selectedOrder.notes);
                return (
                  <>
                <Text style={styles.modalText}>Name: {selectedOrder.name}</Text>
                <Text style={styles.modalText}>
                  Requested:{" "}
                  {selectedOrder.created_at
                    ? new Date(selectedOrder.created_at).toLocaleString()
                    : ""}
                </Text>
                <Text style={styles.modalText}>
                  Address: {selectedOrder.delivery_address}
                </Text>
                {parsedNotes.selectedItems.length > 0 ? (
                  <Text style={styles.modalText}>
                    Items: {parsedNotes.selectedItems.join(", ")}
                  </Text>
                ) : null}
                {parsedNotes.userNotes ? (
                  <Text style={styles.modalText}>
                    Notes: {parsedNotes.userNotes}
                  </Text>
                ) : null}
                  </>
                );
              })()
            ) : null}
            <AppButton
              title="Accept Order"
              onPress={handleAcceptOrder}
              disabled={submitting}
              style={styles.cardButton}
            />
            <AppButton
              title="Close"
              variant="secondary"
              onPress={() => setSelectedOrder(null)}
              style={styles.cardButton}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  activeCard: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
  },
  orderCard: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  orderName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  orderMeta: {
    fontSize: 14,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.sm,
  },
  orderHint: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  cardButton: {
    width: "100%",
    marginTop: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  modalText: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
});
