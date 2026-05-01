import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  calculateDistanceMiles,
  estimateTravelMinutes,
  formatDistanceMiles,
  formatEtaMinutes,
  hasCoordinates,
} from "../lib/deliveryTracking";
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
import { lookupAddress } from "../services/geocode";
import { supabase } from "../services/supabase";
import { ensureVolunteerProfile } from "../lib/volunteerProfile";
import { theme } from "../theme";

const DEMO_API_BASE_URL =
  process.env.EXPO_PUBLIC_DEMO_API_URL ?? "http://localhost:4000";

async function notifyCustomerBySms(customerUid) {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("phone_number, first_name")
      .eq("uid", customerUid)
      .maybeSingle();

    if (!customer?.phone_number) return;

    const firstName = customer.first_name ?? "there";
    await fetch(`${DEMO_API_BASE_URL}/api/notify/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: customer.phone_number,
        message: `Hi ${firstName}, a volunteer has accepted your food pantry order and will be delivering it to you soon!`,
      }),
    });
  } catch (err) {
    console.warn("[sms] Failed to notify customer:", err.message);
  }
}

function buildEtaPreview(coords, deliveryCoords) {
  const distanceMiles = calculateDistanceMiles(coords, deliveryCoords);
  const etaMinutes = estimateTravelMinutes(distanceMiles);

  if (!Number.isFinite(distanceMiles) || !Number.isFinite(etaMinutes)) {
    return null;
  }

  return {
    distanceLabel: formatDistanceMiles(distanceMiles),
    etaLabel: formatEtaMinutes(etaMinutes),
  };
}

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
  const [dashboardCoords, setDashboardCoords] = useState(null);
  const [availableOrderEta, setAvailableOrderEta] = useState({});
  const [previewEtaState, setPreviewEtaState] = useState("idle");
  const [previewEtaMessage, setPreviewEtaMessage] = useState("");
  const router = useRouter();

  const loadDashboardLocation = useCallback(async ({ silent = false } = {}) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setDashboardCoords(null);
        setPreviewEtaState("permission_denied");
        setPreviewEtaMessage(
          "Turn on location access to preview distance before accepting an order.",
        );
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setDashboardCoords(coords);
      setPreviewEtaState("ready");
      setPreviewEtaMessage(
        silent ? "" : "Order ETA previews refreshed from your current location.",
      );
      return coords;
    } catch (error) {
      console.error("Error getting volunteer dashboard location:", error);
      setDashboardCoords(null);
      setPreviewEtaState("location_error");
      setPreviewEtaMessage("We could not get your current location right now.");
      return null;
    }
  }, []);

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
      setAvailableOrderEta({});
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
        .select("*, boxes(box_id, box_number, order_items(item_id, items(label)))")
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
    setAvailableOrderEta({});
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

  const autoLocationRef = useRef(null);

  useEffect(() => {
    const isInTransit = activeOrder?.status === ORDER_STATUS.IN_TRANSIT;

    if (!isInTransit || !activeOrder || !userId) {
      if (autoLocationRef.current) {
        autoLocationRef.current.remove();
        autoLocationRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const startWatching = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;

      autoLocationRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 120000,
          distanceInterval: 200,
        },
        async (position) => {
          if (cancelled) return;
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            capturedAt: new Date().toISOString(),
            sharedForStatus: ORDER_STATUS.IN_TRANSIT,
          };
          const nextNotes = updateOrderTracking(activeOrder.notes, {
            volunteerCoords: coords,
          });
          await supabase
            .from("orders")
            .update({ notes: nextNotes })
            .eq("order_id", activeOrder.order_id)
            .eq("volunteer_uid", userId)
            .eq("status", ORDER_STATUS.IN_TRANSIT);
          setLocationSyncMessage(
            `Location auto-updated at ${new Date().toLocaleTimeString()}.`,
          );
        },
      );
    };

    startWatching();

    return () => {
      cancelled = true;
      if (autoLocationRef.current) {
        autoLocationRef.current.remove();
        autoLocationRef.current = null;
      }
    };
  }, [activeOrder?.order_id, activeOrder?.status, userId]);

  useEffect(() => {
    if (!hasVolunteerProfile || availableOrders.length === 0) {
      setAvailableOrderEta({});
      setPreviewEtaMessage("");
      if (previewEtaState === "loading") {
        setPreviewEtaState("idle");
      }
      return;
    }

    if (dashboardCoords || previewEtaState === "permission_denied") {
      return;
    }

    loadDashboardLocation({ silent: true });
  }, [
    availableOrders.length,
    dashboardCoords,
    hasVolunteerProfile,
    loadDashboardLocation,
    previewEtaState,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableOrderEta = async () => {
      if (!hasVolunteerProfile || availableOrders.length === 0) {
        setAvailableOrderEta({});
        return;
      }

      if (!hasCoordinates(dashboardCoords)) {
        setAvailableOrderEta({});
        return;
      }

      setPreviewEtaState("loading");

      const entries = await Promise.all(
        availableOrders.map(async (order) => {
          const deliveryCoords = await lookupAddress(order.delivery_address);

          if (!hasCoordinates(deliveryCoords)) {
            return [
              order.order_id,
              { state: "address_unavailable" },
            ];
          }

          const preview = buildEtaPreview(dashboardCoords, deliveryCoords);
          if (!preview) {
            return [order.order_id, { state: "address_unavailable" }];
          }

          return [
            order.order_id,
            {
              state: "ready",
              ...preview,
            },
          ];
        }),
      );

      if (cancelled) {
        return;
      }

      setAvailableOrderEta(Object.fromEntries(entries));
      setPreviewEtaState("ready");
      setPreviewEtaMessage("Previewing route distance from your current location.");
    };

    loadAvailableOrderEta();

    return () => {
      cancelled = true;
    };
  }, [
    availableOrders,
    dashboardCoords,
    hasVolunteerProfile,
  ]);

  const acceptDisabled = useMemo(
    () => Boolean(activeOrder) || submitting,
    [activeOrder, submitting],
  );

  const handleRefreshAvailableEta = async () => {
    setPreviewEtaState("loading");
    await loadDashboardLocation();
  };

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

      notifyCustomerBySms(selectedOrder.customer_uid);
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

  const renderBoxSummary = (order) => {
    const boxes = [...(order.boxes ?? [])].sort((a, b) => a.box_number - b.box_number);
    const parsedNotes = parseOrderNotes(order.notes);

    if (boxes.length > 0) {
      return boxes.map((box) => {
        const items = (box.order_items ?? []).map((e) => e.items?.label).filter(Boolean);
        return (
          <Text key={box.box_id} style={styles.orderMeta}>
            {boxes.length > 1 ? `Box ${box.box_number}: ` : "Items: "}
            {items.length > 0 ? items.join(", ") : "No items selected"}
          </Text>
        );
      });
    }

    if (parsedNotes.selectedItems.length > 0) {
      return (
        <Text style={styles.orderMeta}>
          Items: {parsedNotes.selectedItems.join(", ")}
        </Text>
      );
    }

    return null;
  };

  const renderAvailableOrder = (order) => {
    const statusMeta = getOrderStatusMeta(order.status);
    const etaPreview = availableOrderEta[order.order_id];
    const boxCount = order.box_count ?? (order.boxes?.length ?? null);

    return (
      <View
        key={order.order_id}
        testID={`volunteer-dashboard-order-${order.order_id}`}
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
        {boxCount ? (
          <Text style={styles.orderMeta}>
            {boxCount === 1 ? "1 box" : `${boxCount} boxes`}
          </Text>
        ) : null}
        {renderBoxSummary(order)}
        {etaPreview?.state === "ready" ? (
          <Text style={styles.orderMeta}>
            ETA: {etaPreview.etaLabel} ({etaPreview.distanceLabel} away)
          </Text>
        ) : null}
        {etaPreview?.state === "address_unavailable" ? (
          <Text style={styles.orderMeta}>
            ETA preview unavailable for this delivery address.
          </Text>
        ) : null}
        <AppButton
          title={acceptDisabled ? "Finish active delivery first" : "Accept"}
          variant={acceptDisabled ? "secondary" : "primary"}
          disabled={acceptDisabled}
          onPress={() => setSelectedOrder(order)}
          style={styles.cardButton}
          testID={`volunteer-dashboard-open-accept-${order.order_id}`}
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
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Volunteer Operations</Text>
          <Text style={styles.title}>Volunteer dashboard</Text>
          <Text style={styles.heroSubtitle}>
            Track your active delivery, browse open requests, and keep ETA
            updates flowing back to requesters.
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>
                {activeOrder ? "1 active delivery" : "No active delivery"}
              </Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>
                {availableOrders.length} open request
                {availableOrders.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
          {hasVolunteerProfile && profileMessage ? (
            <Text style={styles.heroNote}>{profileMessage}</Text>
          ) : null}
        </View>

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
              <Text testID="volunteer-dashboard-active-status" style={styles.orderMeta}>
                Status: {activeStatusMeta.label}
              </Text>
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
              <Text style={styles.orderHint}>{activeStatusMeta.volunteerDescription ?? activeStatusMeta.description}</Text>
              {locationSyncMessage ? (
                <Text style={styles.orderHint}>{locationSyncMessage}</Text>
              ) : null}
              <AppButton
                title="View Delivery Details"
                onPress={openDeliveryDetails}
                variant="secondary"
                style={styles.cardButton}
                testID="volunteer-dashboard-view-delivery-details"
              />
              {ACTIVE_VOLUNTEER_STATUSES.includes(activeOrder.status) ? (
                <AppButton
                  title="Share My Location with Customer"
                  onPress={handleSyncActiveLocation}
                  disabled={submitting}
                  variant="secondary"
                  style={styles.cardButton}
                  testID="volunteer-dashboard-update-eta"
                />
              ) : null}
              {activeOrder.status === ORDER_STATUS.ACCEPTED ? (
                <AppButton
                  title="Start Delivery"
                  onPress={() => handleAdvanceActiveOrder(ORDER_STATUS.IN_TRANSIT)}
                  disabled={submitting}
                  style={styles.cardButton}
                  testID="volunteer-dashboard-start-delivery"
                />
              ) : null}
              {activeOrder.status === ORDER_STATUS.IN_TRANSIT ? (
                <AppButton
                  title="Mark Delivered"
                  onPress={() => handleAdvanceActiveOrder(ORDER_STATUS.DELIVERED)}
                  disabled={submitting}
                  style={styles.cardButton}
                  testID="volunteer-dashboard-mark-delivered"
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
            <>
              {previewEtaMessage ? (
                <Text style={styles.emptyText}>{previewEtaMessage}</Text>
              ) : null}
              {previewEtaState === "loading" ? (
                <Text style={styles.emptyText}>Refreshing ETA previews...</Text>
              ) : null}
              <AppButton
                title="Refresh ETA Preview"
                onPress={handleRefreshAvailableEta}
                disabled={submitting || previewEtaState === "loading"}
                variant="secondary"
                style={styles.refreshButton}
                testID="volunteer-dashboard-refresh-eta-preview"
              />
              {availableOrders.map(renderAvailableOrder)}
            </>
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
                const boxes = [...(selectedOrder.boxes ?? [])].sort(
                  (a, b) => a.box_number - b.box_number,
                );
                const boxCount = selectedOrder.box_count ?? (boxes.length || null);
                return (
                  <>
                    <Text style={styles.modalText}>
                      Name: {selectedOrder.name}
                    </Text>
                    <Text style={styles.modalText}>
                      Requested:{" "}
                      {selectedOrder.created_at
                        ? new Date(selectedOrder.created_at).toLocaleString()
                        : ""}
                    </Text>
                    <Text style={styles.modalText}>
                      Address: {selectedOrder.delivery_address}
                    </Text>
                    {boxCount ? (
                      <Text style={styles.modalText}>
                        Boxes: {boxCount === 1 ? "1 box" : `${boxCount} boxes`}
                      </Text>
                    ) : null}
                    {boxes.length > 0
                      ? boxes.map((box) => {
                          const items = (box.order_items ?? [])
                            .map((e) => e.items?.label)
                            .filter(Boolean);
                          return (
                            <Text key={box.box_id} style={styles.modalText}>
                              {boxes.length > 1 ? `Box ${box.box_number}: ` : "Items: "}
                              {items.length > 0 ? items.join(", ") : "No items selected"}
                            </Text>
                          );
                        })
                      : parsedNotes.selectedItems.length > 0
                      ? (
                          <Text style={styles.modalText}>
                            Items: {parsedNotes.selectedItems.join(", ")}
                          </Text>
                        )
                      : null}
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
              testID="volunteer-dashboard-confirm-accept"
            />
            <AppButton
              title="Close"
              variant="secondary"
              onPress={() => setSelectedOrder(null)}
              style={styles.cardButton}
              testID="volunteer-dashboard-close-accept-modal"
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
    paddingBottom: theme.spacing.xxl,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
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
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: 29,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  heroSubtitle: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  summaryPill: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  heroNote: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.infoText,
    lineHeight: 21,
  },
  section: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
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
  refreshButton: {
    width: "100%",
    marginBottom: theme.spacing.md,
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
