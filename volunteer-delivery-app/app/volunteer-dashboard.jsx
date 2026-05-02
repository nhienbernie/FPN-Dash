import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Relative-time helper (for "last updated" display) ────────────────────────
function formatRelativeTime(date) {
  if (!date) return null;
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
import VolunteerMapView from "../components/VolunteerMapView";
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
  buildRelinquishmentNotes,
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
import { PANTRY_LOCATIONS } from "../lib/pantryLocations";
import { supabase } from "../services/supabase";
import { DEMO_API_BASE_URL } from "../lib/apiConfig";
import { ensureVolunteerProfile } from "../lib/volunteerProfile";
import { theme } from "../theme";

let didPatchExpoLocationCleanup = false;

function ensureExpoLocationCleanupCompatibility() {
  if (didPatchExpoLocationCleanup) {
    return;
  }

  didPatchExpoLocationCleanup = true;

  try {
    const { LocationEventEmitter } = require("expo-location/build/LocationEventEmitter");

    if (typeof LocationEventEmitter?.removeSubscription !== "function") {
      // Expo Location 19 can return a module-backed emitter here, which exposes
      // subscription.remove() but not the legacy removeSubscription() helper.
      LocationEventEmitter.removeSubscription = (subscription) => {
        subscription?.remove?.();
      };
    }
  } catch (error) {
    console.warn(
      "[location] Failed to install Expo Location cleanup compatibility shim:",
      error?.message ?? error,
    );
  }
}

ensureExpoLocationCleanupCompatibility();

// Module-level cache for pantry coordinates so they are only geocoded once
// per app session regardless of how many times the dashboard mounts.
let resolvedPantryLocations = null;

async function resolvePantryLocations() {
  if (resolvedPantryLocations) return resolvedPantryLocations;
  const results = await Promise.all(
    PANTRY_LOCATIONS.map(async (pantry) => {
      const coords = await lookupAddress(pantry.address);
      return {
        ...pantry,
        coords: coords?.latitude && coords?.longitude ? coords : null,
      };
    }),
  );
  resolvedPantryLocations = results;
  return results;
}

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
  const [orderCoords, setOrderCoords] = useState({});
  const [activeOrderCoords, setActiveOrderCoords] = useState(null);
  const [previewEtaState, setPreviewEtaState] = useState("idle");
  const [previewEtaMessage, setPreviewEtaMessage] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [pantryLocations, setPantryLocations] = useState(
    // Use the cached result immediately on re-mounts
    resolvedPantryLocations ?? [],
  );

  // Live-update extras
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [newOrderBanner, setNewOrderBanner] = useState(null); // { count } | null
  const [, setTimeTick] = useState(0); // force re-render for relative-time label

  // Geocode cache — avoids re-calling the geocoder for orders we already know
  const geocodeCacheRef = useRef({});
  // Tracks order_ids we have already shown; null until after the first fetch
  const seenOrderIdsRef = useRef(null);
  // Banner auto-dismiss timer
  const bannerTimerRef = useRef(null);
  // Ref forwarded to VolunteerMapView so we can call fitToAll imperatively
  const mapRef = useRef(null);
  // Banner entrance animation
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const router = useRouter();

  // Geocode pantry locations once per app session (module-level cache means
  // this is a no-op on re-mounts after the first resolve).
  useEffect(() => {
    if (resolvedPantryLocations) return; // already done
    resolvePantryLocations().then(setPantryLocations);
  }, []);

  // Tick every 15 s so "Updated X ago" stays current without a full re-fetch
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Clean up the banner timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const showNewOrderBanner = useCallback(
    (count) => {
      setNewOrderBanner({ count });
      Animated.sequence([
        Animated.timing(bannerAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(3_500),
        Animated.timing(bannerAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setNewOrderBanner(null));
    },
    [bannerAnim],
  );

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

    const normalizedPending = (pendingOrders || []).map(normalizeOrder);
    const incomingIds = normalizedPending.map((o) => o.order_id);

    // Detect genuinely new orders (skip on the very first load)
    if (seenOrderIdsRef.current !== null) {
      const newIds = incomingIds.filter((id) => !seenOrderIdsRef.current.has(id));
      if (newIds.length > 0) {
        showNewOrderBanner(newIds.length);
      }
      // Keep seen-set in sync with the current pending list
      seenOrderIdsRef.current = new Set(incomingIds);
    } else {
      seenOrderIdsRef.current = new Set(incomingIds);
    }

    setAvailableOrders(normalizedPending);
    setAvailableOrderEta({});
    setLastUpdatedAt(new Date());
    setActiveOrder(volunteerOrder ? normalizeOrder(volunteerOrder) : null);
    if (!volunteerOrder) {
      setLocationSyncMessage("");
    }
    setLoading(false);
  }, [showNewOrderBanner]);

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
    const shouldAutoShareLocation = ACTIVE_VOLUNTEER_STATUSES.includes(
      activeOrder?.status,
    );

    if (!shouldAutoShareLocation || !activeOrder || !userId) {
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
            sharedForStatus: activeOrder.status,
          };
          const nextNotes = updateOrderTracking(activeOrder.notes, {
            volunteerCoords: coords,
          });
          await supabase
            .from("orders")
            .update({ notes: nextNotes })
            .eq("order_id", activeOrder.order_id)
            .eq("volunteer_uid", userId)
            .eq("status", activeOrder.status);
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
        setOrderCoords({});
        return;
      }

      if (!hasCoordinates(dashboardCoords)) {
        setAvailableOrderEta({});
        setOrderCoords({});
        return;
      }

      setPreviewEtaState("loading");

      // Only geocode orders whose address we haven't resolved yet.
      // This makes live-updates near-instant: only new orders pay the
      // geocoding cost; existing orders reuse the in-memory cache.
      const uncached = availableOrders.filter(
        (o) => !geocodeCacheRef.current[o.order_id],
      );

      const freshEntries = await Promise.all(
        uncached.map(async (order) => {
          const coords = await lookupAddress(order.delivery_address);
          return {
            id: order.order_id,
            coords: hasCoordinates(coords) ? coords : null,
          };
        }),
      );

      if (cancelled) return;

      // Populate cache with freshly resolved coordinates
      for (const entry of freshEntries) {
        if (entry.coords) {
          geocodeCacheRef.current[entry.id] = entry.coords;
        } else {
          // Mark as unavailable so we don't retry on every update
          geocodeCacheRef.current[entry.id] = null;
        }
      }

      // Build full ETA + coord results from the now-complete cache
      const allResults = availableOrders.map((order) => {
        const deliveryCoords = geocodeCacheRef.current[order.order_id] ?? null;

        if (!hasCoordinates(deliveryCoords)) {
          return { id: order.order_id, eta: { state: "address_unavailable" }, coords: null };
        }

        const preview = buildEtaPreview(dashboardCoords, deliveryCoords);
        return {
          id: order.order_id,
          eta: preview ? { state: "ready", ...preview } : { state: "address_unavailable" },
          coords: deliveryCoords,
        };
      });

      setAvailableOrderEta(Object.fromEntries(allResults.map((r) => [r.id, r.eta])));
      setOrderCoords(
        Object.fromEntries(allResults.filter((r) => r.coords).map((r) => [r.id, r.coords])),
      );
      setPreviewEtaState("ready");
      setPreviewEtaMessage("Previewing route distance from your current location.");

      // Animate the map viewport to include all visible order pins
      const allMapCoords = [
        ...allResults.filter((r) => r.coords).map((r) => r.coords),
        ...(dashboardCoords ? [dashboardCoords] : []),
      ];
      if (allMapCoords.length > 0) {
        mapRef.current?.fitToAll(allMapCoords);
      }
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

  useEffect(() => {
    let cancelled = false;
    if (!activeOrder?.delivery_address) {
      setActiveOrderCoords(null);
      return;
    }
    lookupAddress(activeOrder.delivery_address).then((coords) => {
      if (!cancelled) {
        setActiveOrderCoords(hasCoordinates(coords) ? coords : null);
      }
    });
    return () => { cancelled = true; };
  }, [activeOrder?.delivery_address]);

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

  const handleReleaseOrder = () => {
    if (!activeOrder || !userId) return;

    Alert.alert(
      "Release order?",
      "The order will go back to the available queue so another volunteer can pick it up. Your current progress will be saved in the delivery notes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              const updatedNotes = buildRelinquishmentNotes(
                activeOrder.notes,
                userId,
              );
              const { error } = await supabase
                .from("orders")
                .update({
                  status: ORDER_STATUS.PENDING,
                  volunteer_uid: null,
                  notes: updatedNotes,
                })
                .eq("order_id", activeOrder.order_id)
                .eq("volunteer_uid", userId);

              if (error) {
                console.error("Error releasing order:", error);
                Alert.alert("Error", "Unable to release this order right now.");
                return;
              }

              fetchOrders();
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
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
          <View style={styles.viewToggleRow}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "list" ? styles.viewToggleBtnActive : null]}
              onPress={() => setViewMode("list")}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewToggleText, viewMode === "list" ? styles.viewToggleTextActive : null]}>
                List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "map" ? styles.viewToggleBtnActive : null]}
              onPress={() => setViewMode("map")}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewToggleText, viewMode === "map" ? styles.viewToggleTextActive : null]}>
                Map
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {viewMode === "map" ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Order Map</Text>
              {lastUpdatedAt ? (
                <Text style={styles.lastUpdatedLabel}>
                  Updated {formatRelativeTime(lastUpdatedAt)}
                </Text>
              ) : null}
            </View>
            <VolunteerMapView
              ref={mapRef}
              volunteerCoords={dashboardCoords}
              availableOrders={availableOrders}
              orderCoords={orderCoords}
              activeOrder={activeOrder}
              activeOrderCoords={activeOrderCoords}
              pantryLocations={pantryLocations}
              onOrderPress={(order) => setSelectedOrder(order)}
            />
          </View>
        ) : null}

        {/* ── New-order banner ───────────────────────────────────────── */}
        {newOrderBanner ? (
          <Animated.View style={[styles.newOrderBanner, { opacity: bannerAnim }]}>
            <Text style={styles.newOrderBannerText}>
              🟡 {newOrderBanner.count} new order
              {newOrderBanner.count !== 1 ? "s" : ""} just arrived
            </Text>
          </Animated.View>
        ) : null}

        <View style={[styles.section, viewMode === "map" ? styles.sectionCompact : null]}>
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
              <AppButton
                title="Release back to queue"
                variant="danger"
                onPress={handleReleaseOrder}
                disabled={submitting}
                style={styles.releaseButton}
                testID="volunteer-dashboard-release-order"
              />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              You do not have an active delivery right now.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Available Orders</Text>
            {lastUpdatedAt ? (
              <Text style={styles.lastUpdatedLabel}>
                {formatRelativeTime(lastUpdatedAt)}
              </Text>
            ) : null}
          </View>
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
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  lastUpdatedLabel: {
    fontSize: 12,
    color: theme.colors.mutedText,
    fontWeight: "500",
  },
  newOrderBanner: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  newOrderBannerText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.secondaryText,
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
  releaseButton: {
    width: "100%",
    marginTop: theme.spacing.md,
  },
  viewToggleRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
  },
  viewToggleBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  viewToggleTextActive: {
    color: theme.colors.primaryText,
  },
  sectionCompact: {
    paddingVertical: theme.spacing.md,
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
