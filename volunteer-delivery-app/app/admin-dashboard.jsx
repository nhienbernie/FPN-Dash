import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import {
  ADMIN_TABS,
  buildAdminMetrics,
  buildQueueHeadline,
  formatElapsedSince,
  formatQueueAge,
  getCustomerLabel,
  getOrderStatusBadge,
  getOrderSummary,
  getReportReasonMeta,
  getReportStatusMeta,
  isComplaintOpen,
  isMenuEditable,
  isOrderCancellable,
} from "../lib/adminDashboard";
import { buildOrderNotes, parseOrderNotes } from "../lib/orderSelectionWorkaround";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const TAB_COPY = {
  changes: {
    title: "Order menu changes",
    subtitle:
      "Update box contents or instructions before an order is fully underway.",
  },
  cancellations: {
    title: "Order cancellations",
    subtitle:
      "Remove orders that should not continue and clear the queue for the team.",
  },
  complaints: {
    title: "Complaint handling",
    subtitle:
      "Triage safety and service complaints with a clearer review flow.",
  },
};

function formatPersonName(row) {
  const first = String(row?.first_name ?? "").trim();
  const last = String(row?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "";
}

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function buildAddressSummary(value) {
  if (!value) return "No address saved";
  return String(value);
}

function buildProfileMap(rows) {
  return Object.fromEntries(
    (rows ?? []).map((row) => [row.uid, formatPersonName(row)]),
  );
}

function normalizeDraftItemId(value) {
  return String(value);
}

function createEditDraft(order) {
  const summary = getOrderSummary(order);
  const existingBoxes =
    summary.boxDetails.length > 0
      ? summary.boxDetails.map((box) => ({
          boxNumber: box.boxNumber,
          selectedItemIds: box.itemIds.map(normalizeDraftItemId),
        }))
      : Array.from({ length: summary.boxCount }, (_, index) => ({
          boxNumber: index + 1,
          selectedItemIds: [],
        }));

  return {
    boxCount: existingBoxes.length,
    boxes: existingBoxes,
    userNotes: summary.specialInstructions,
  };
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [activeTab, setActiveTab] = useState("changes");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [activeEditBoxIndex, setActiveEditBoxIndex] = useState(0);
  const [focusedComplaint, setFocusedComplaint] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    orders: [],
    reports: [],
    itemCatalog: [],
    customersById: {},
    volunteersById: {},
  });

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [
        ordersResult,
        reportsResult,
        itemsResult,
        customersResult,
        volunteersResult,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select(
            `
              order_id,
              name,
              status,
              created_at,
              delivery_address,
              customer_uid,
              volunteer_uid,
              box_count,
              notes,
              boxes (
                box_id,
                box_number,
                order_items (
                  item_id,
                  items (
                    label,
                    category
                  )
                )
              )
            `,
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("reports")
          .select(
            `
              order_id,
              reporter_id,
              reported_id,
              reporter_role,
              reported_role,
              reason,
              description,
              status,
              created_at
            `,
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("items")
          .select("id, label, category")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("label", { ascending: true }),
        supabase.from("customers").select("uid, first_name, last_name"),
        supabase.from("volunteers").select("uid, first_name, last_name"),
      ]);

      const possibleErrors = [
        ordersResult.error,
        reportsResult.error,
        itemsResult.error,
        customersResult.error,
        volunteersResult.error,
      ].filter(Boolean);

      if (possibleErrors.length > 0) {
        throw new Error(possibleErrors[0].message);
      }

      setDashboardData({
        orders: ordersResult.data ?? [],
        reports: reportsResult.data ?? [],
        itemCatalog: itemsResult.data ?? [],
        customersById: buildProfileMap(customersResult.data),
        volunteersById: buildProfileMap(volunteersResult.data),
      });
      setLastRefreshedAt(new Date().toISOString());
    } catch (error) {
      console.error("Error loading admin dashboard:", error);
      Alert.alert(
        "Unable to Load Admin Dashboard",
        error.message || "Please try refreshing again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard({ silent: true });
  };

  const metrics = useMemo(
    () => buildAdminMetrics(dashboardData.orders, dashboardData.reports),
    [dashboardData.orders, dashboardData.reports],
  );

  const metricCards = useMemo(() => metrics.slice(0, 4), [metrics]);
  const queueHeadline = useMemo(() => buildQueueHeadline(metrics), [metrics]);

  const itemCatalogById = useMemo(
    () =>
      Object.fromEntries(
        dashboardData.itemCatalog.map((item) => [normalizeDraftItemId(item.id), item]),
      ),
    [dashboardData.itemCatalog],
  );

  const itemsByCategory = useMemo(() => {
    const grouped = {};

    for (const item of dashboardData.itemCatalog) {
      const category = item.category || "Other";

      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    }

    return Object.entries(grouped);
  }, [dashboardData.itemCatalog]);

  const ordersById = useMemo(
    () => Object.fromEntries(dashboardData.orders.map((order) => [order.order_id, order])),
    [dashboardData.orders],
  );

  const menuQueue = useMemo(
    () =>
      dashboardData.orders
        .filter((order) => isMenuEditable(order.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [dashboardData.orders],
  );

  const cancellationQueue = useMemo(
    () =>
      dashboardData.orders
        .filter((order) => isOrderCancellable(order.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [dashboardData.orders],
  );

  const complaintQueue = useMemo(() => {
    const severityRank = {
      High: 0,
      Medium: 1,
      Low: 2,
    };

    return dashboardData.reports
      .filter((report) => isComplaintOpen(report.status))
      .sort((a, b) => {
        const aSeverity = getReportReasonMeta(a.reason).severity;
        const bSeverity = getReportReasonMeta(b.reason).severity;
        const severityDiff =
          (severityRank[aSeverity] ?? 99) - (severityRank[bSeverity] ?? 99);

        if (severityDiff !== 0) {
          return severityDiff;
        }

        return new Date(a.created_at) - new Date(b.created_at);
      });
  }, [dashboardData.reports]);

  const openMenuEditor = (order) => {
    setEditingOrder(order);
    setEditDraft(createEditDraft(order));
    setActiveEditBoxIndex(0);
  };

  const closeMenuEditor = (force = false) => {
    if (!force && busyKey === `save-menu-${editingOrder?.order_id}`) {
      return;
    }

    setEditingOrder(null);
    setEditDraft(null);
    setActiveEditBoxIndex(0);
  };

  const updateDraftBoxCount = (nextBoxCount) => {
    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      const safeCount = Math.max(1, nextBoxCount);
      const nextBoxes = [...current.boxes];

      if (safeCount > nextBoxes.length) {
        for (let index = nextBoxes.length; index < safeCount; index += 1) {
          nextBoxes.push({
            boxNumber: index + 1,
            selectedItemIds: [],
          });
        }
      } else {
        nextBoxes.length = safeCount;
      }

      const reNumbered = nextBoxes.map((box, index) => ({
        ...box,
        boxNumber: index + 1,
      }));

      setActiveEditBoxIndex((currentIndex) =>
        Math.min(currentIndex, reNumbered.length - 1),
      );

      return {
        ...current,
        boxCount: safeCount,
        boxes: reNumbered,
      };
    });
  };

  const toggleDraftItem = (itemId) => {
    const normalizedItemId = normalizeDraftItemId(itemId);

    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      const nextBoxes = current.boxes.map((box, index) => {
        if (index !== activeEditBoxIndex) {
          return box;
        }

        const exists = box.selectedItemIds.includes(normalizedItemId);
        return {
          ...box,
          selectedItemIds: exists
            ? box.selectedItemIds.filter((selectedId) => selectedId !== normalizedItemId)
            : [...box.selectedItemIds, normalizedItemId],
        };
      });

      return {
        ...current,
        boxes: nextBoxes,
      };
    });
  };

  const handleSaveMenuChanges = async () => {
    if (!editingOrder || !editDraft) {
      return;
    }

    const orderId = editingOrder.order_id;
    setBusyKey(`save-menu-${orderId}`);

    try {
      const nextBoxes = editDraft.boxes.map((box, index) => ({
        ...box,
        boxNumber: index + 1,
      }));
      const existingBoxes = [...(editingOrder.boxes ?? [])].sort(
        (a, b) => (a?.box_number ?? 0) - (b?.box_number ?? 0),
      );
      const keptBoxes = existingBoxes.slice(0, nextBoxes.length);
      const removedBoxes = existingBoxes.slice(nextBoxes.length);
      const removedBoxIds = removedBoxes
        .map((box) => box.box_id)
        .filter(Boolean);

      if (removedBoxIds.length > 0) {
        const { error: removeOrderItemsError } = await supabase
          .from("order_items")
          .delete()
          .in("box_id", removedBoxIds);

        if (removeOrderItemsError) {
          throw removeOrderItemsError;
        }

        const { error: removeBoxesError } = await supabase
          .from("boxes")
          .delete()
          .in("box_id", removedBoxIds);

        if (removeBoxesError) {
          throw removeBoxesError;
        }
      }

      for (let index = 0; index < keptBoxes.length; index += 1) {
        const box = keptBoxes[index];
        const nextBoxNumber = index + 1;

        if (box.box_number !== nextBoxNumber) {
          const { error: updateBoxError } = await supabase
            .from("boxes")
            .update({ box_number: nextBoxNumber })
            .eq("box_id", box.box_id);

          if (updateBoxError) {
            throw updateBoxError;
          }
        }
      }

      let createdBoxes = [];
      if (nextBoxes.length > keptBoxes.length) {
        const rows = nextBoxes.slice(keptBoxes.length).map((box) => ({
          order_id: orderId,
          box_number: box.boxNumber,
        }));

        const { data, error: createBoxesError } = await supabase
          .from("boxes")
          .insert(rows)
          .select("box_id, box_number");

        if (createBoxesError) {
          throw createBoxesError;
        }

        createdBoxes = data ?? [];
      }

      const finalBoxes = [...keptBoxes, ...createdBoxes].sort(
        (a, b) => (a?.box_number ?? 0) - (b?.box_number ?? 0),
      );
      const finalBoxIds = finalBoxes.map((box) => box.box_id).filter(Boolean);

      if (finalBoxIds.length > 0) {
        const { error: clearItemsError } = await supabase
          .from("order_items")
          .delete()
          .in("box_id", finalBoxIds);

        if (clearItemsError) {
          throw clearItemsError;
        }
      }

      const orderItemRows = finalBoxes.flatMap((box, index) =>
        (nextBoxes[index]?.selectedItemIds ?? []).map((itemId) => ({
          box_id: box.box_id,
          item_id: Number.isFinite(Number(itemId)) ? Number(itemId) : itemId,
        })),
      );

      if (orderItemRows.length > 0) {
        const { error: insertItemsError } = await supabase
          .from("order_items")
          .insert(orderItemRows);

        if (insertItemsError) {
          throw insertItemsError;
        }
      }

      const existingTracking = parseOrderNotes(editingOrder.notes).tracking;
      const selectedLabels = nextBoxes.flatMap((box) =>
        box.selectedItemIds.map(
          (itemId) => itemCatalogById[itemId]?.label ?? String(itemId),
        ),
      );
      const nextNotes = buildOrderNotes({
        selectedItems: selectedLabels,
        userNotes: editDraft.userNotes,
        tracking: existingTracking,
      });

      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({
          box_count: nextBoxes.length,
          notes: nextNotes,
        })
        .eq("order_id", orderId);

      if (updateOrderError) {
        throw updateOrderError;
      }

      closeMenuEditor(true);
      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error saving menu changes:", error);
      Alert.alert(
        "Unable to Save Menu Changes",
        error.message || "Please try again.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const performCancelOrder = async (order) => {
    setBusyKey(`cancel-${order.order_id}`);

    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("order_id", order.order_id);

      if (error) {
        throw error;
      }

      if (focusedComplaint?.order_id === order.order_id) {
        setFocusedComplaint(null);
      }

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error cancelling order:", error);
      Alert.alert("Order Cancellation Failed", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
  };

  const handleCancelOrder = (order) => {
    const customerLabel = getCustomerLabel(order, dashboardData.customersById);
    const volunteerLabel = order.volunteer_uid
      ? dashboardData.volunteersById[order.volunteer_uid]
      : "";
    const detail = volunteerLabel
      ? `This also clears the assignment for ${volunteerLabel}.`
      : "This removes the order from the active queue.";

    Alert.alert(
      "Cancel this order?",
      `${customerLabel}'s order will be removed.\n\n${detail}`,
      [
        {
          text: "Keep order",
          style: "cancel",
        },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: () => {
            void performCancelOrder(order);
          },
        },
      ],
    );
  };

  const handleSetReportStatus = async (report, nextStatus) => {
    setBusyKey(`report-${report.order_id}-${nextStatus}`);

    try {
      let query = supabase
        .from("reports")
        .update({ status: nextStatus })
        .eq("order_id", report.order_id)
        .eq("reporter_id", report.reporter_id)
        .eq("status", report.status);

      if (report.created_at) {
        query = query.eq("created_at", report.created_at);
      }

      const { error } = await query;

      if (error) {
        throw error;
      }

      setFocusedComplaint(null);
      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error updating report status:", error);
      Alert.alert("Complaint Update Failed", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
  };

  const currentTabCopy = TAB_COPY[activeTab];
  const currentEditBox = editDraft?.boxes?.[activeEditBoxIndex] ?? null;

  const renderQueueCard = (order, mode) => {
    const statusMeta = getOrderStatusBadge(order);
    const summary = getOrderSummary(order);
    const customerLabel = getCustomerLabel(order, dashboardData.customersById);
    const volunteerLabel = order.volunteer_uid
      ? dashboardData.volunteersById[order.volunteer_uid]
      : "";
    const itemsPreview =
      summary.itemLabels.length > 0
        ? summary.itemLabels.slice(0, 4).join(", ")
        : "No item selections saved yet.";

    return (
      <View key={`${mode}-${order.order_id}`} style={styles.queueCard}>
        <View style={styles.queueCardHeader}>
          <View style={styles.queueCardTitleBlock}>
            <Text style={styles.queueCardTitle}>{customerLabel}</Text>
            <Text style={styles.queueCardMeta}>
              Order #{order.order_id} • {formatQueueAge(order.created_at)}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: statusMeta.backgroundColor,
                borderColor: statusMeta.borderColor,
              },
            ]}
          >
            <Text style={styles.badgeText}>{statusMeta.label}</Text>
          </View>
        </View>

        <Text style={styles.queueLabel}>Menu snapshot</Text>
        <Text style={styles.queueValue}>
          {summary.boxCount} box{summary.boxCount === 1 ? "" : "es"} • {itemsPreview}
        </Text>

        <Text style={styles.queueLabel}>Delivery address</Text>
        <Text style={styles.queueValue}>
          {buildAddressSummary(order.delivery_address)}
        </Text>

        {volunteerLabel ? (
          <>
            <Text style={styles.queueLabel}>Assigned volunteer</Text>
            <Text style={styles.queueValue}>{volunteerLabel}</Text>
          </>
        ) : null}

        {summary.specialInstructions ? (
          <>
            <Text style={styles.queueLabel}>Special instructions</Text>
            <Text style={styles.queueValue}>{summary.specialInstructions}</Text>
          </>
        ) : null}

        <View style={styles.actionRow}>
          {mode === "changes" ? (
            <AppButton
              title="Edit Menu"
              onPress={() => openMenuEditor(order)}
              style={styles.inlineAction}
            />
          ) : (
            <AppButton
              title="Cancel Order"
              variant="secondary"
              onPress={() => handleCancelOrder(order)}
              disabled={busyKey === `cancel-${order.order_id}`}
              style={styles.inlineAction}
            />
          )}
        </View>
      </View>
    );
  };

  const renderComplaintCard = (report) => {
    const reasonMeta = getReportReasonMeta(report.reason);
    const statusMeta = getReportStatusMeta(report.status);
    const relatedOrder = ordersById[report.order_id];
    const customerLabel = relatedOrder
      ? getCustomerLabel(relatedOrder, dashboardData.customersById)
      : `Order #${report.order_id}`;

    return (
      <View key={`${report.order_id}-${report.created_at}`} style={styles.queueCard}>
        <View style={styles.queueCardHeader}>
          <View style={styles.queueCardTitleBlock}>
            <Text style={styles.queueCardTitle}>{reasonMeta.label}</Text>
            <Text style={styles.queueCardMeta}>
              {customerLabel} • {formatQueueAge(report.created_at)}
            </Text>
          </View>
          <View style={styles.complaintBadges}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: reasonMeta.backgroundColor,
                  borderColor: reasonMeta.borderColor,
                },
              ]}
            >
              <Text style={styles.badgeText}>{reasonMeta.severity}</Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: statusMeta.backgroundColor,
                  borderColor: statusMeta.borderColor,
                },
              ]}
            >
              <Text style={styles.badgeText}>{statusMeta.label}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.queueLabel}>Complaint routing</Text>
        <Text style={styles.queueValue}>{reasonMeta.queueSummary}</Text>

        <Text style={styles.queueLabel}>Who is involved</Text>
        <Text style={styles.queueValue}>
          {report.reporter_role} reporting {report.reported_role}
        </Text>

        <Text style={styles.queueLabel}>Submitted</Text>
        <Text style={styles.queueValue}>{formatTimestamp(report.created_at)}</Text>

        <Text style={styles.queueLabel}>Details</Text>
        <Text style={styles.queueValue}>
          {report.description || "No extra details were included."}
        </Text>

        <View style={styles.actionRow}>
          <AppButton
            title="Review Case"
            onPress={() => setFocusedComplaint(report)}
            style={styles.inlineAction}
          />
        </View>
      </View>
    );
  };

  const renderActiveQueue = () => {
    if (activeTab === "changes") {
      if (loading) {
        return <Text style={styles.emptyText}>Loading editable orders...</Text>;
      }

      if (menuQueue.length === 0) {
        return (
          <Text style={styles.emptyText}>
            No pending or accepted orders need menu changes right now.
          </Text>
        );
      }

      return menuQueue.map((order) => renderQueueCard(order, "changes"));
    }

    if (activeTab === "cancellations") {
      if (loading) {
        return <Text style={styles.emptyText}>Loading cancellable orders...</Text>;
      }

      if (cancellationQueue.length === 0) {
        return (
          <Text style={styles.emptyText}>
            No pending or accepted orders are waiting on cancellation.
          </Text>
        );
      }

      return cancellationQueue.map((order) => renderQueueCard(order, "cancellations"));
    }

    if (loading) {
      return <Text style={styles.emptyText}>Loading complaints...</Text>;
    }

    if (complaintQueue.length === 0) {
      return (
        <Text style={styles.emptyText}>
          No open complaints are waiting for review.
        </Text>
      );
    }

    return complaintQueue.map(renderComplaintCard);
  };

  const focusedComplaintMeta = focusedComplaint
    ? getReportReasonMeta(focusedComplaint.reason)
    : null;
  const focusedComplaintStatusMeta = focusedComplaint
    ? getReportStatusMeta(focusedComplaint.status)
    : null;
  const focusedComplaintOrder = focusedComplaint
    ? ordersById[focusedComplaint.order_id]
    : null;
  const focusedComplaintOrderSummary = focusedComplaintOrder
    ? getOrderSummary(focusedComplaintOrder)
    : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Admin Triage</Text>
            <Text style={styles.title}>Focus the dashboard on decisions.</Text>
            <Text style={styles.subtitle}>
              Prioritize order menu changes, cancellations, and complaint handling
              before anything else.
            </Text>
            <View style={styles.heroNote}>
              <Text style={styles.heroNoteText}>{queueHeadline}</Text>
            </View>
            <Text style={styles.lastUpdatedText}>
              Last refreshed {lastRefreshedAt ? formatElapsedSince(lastRefreshedAt) : "just now"}
            </Text>
          </View>
          <View style={styles.heroActions}>
            <AppButton
              title="Refresh"
              onPress={onRefresh}
              variant="secondary"
              style={styles.heroButton}
              disabled={loading || refreshing}
            />
            <AppButton
              title="Back Home"
              onPress={() => router.push("/mode-select")}
              variant="ghost"
              style={styles.heroButton}
            />
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {metricCards.map((card) => (
            <View key={card.label} style={styles.metricCard}>
              <View
                style={[
                  styles.metricAccent,
                  { backgroundColor: card.accent },
                ]}
              />
              <Text style={styles.metricValue}>{card.value}</Text>
              <Text style={styles.metricLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.segmentedControl}>
          {ADMIN_TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.segmentButton,
                  isActive ? styles.segmentButtonActive : null,
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    isActive ? styles.segmentTextActive : null,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{currentTabCopy.title}</Text>
          <Text style={styles.sectionSubtitle}>{currentTabCopy.subtitle}</Text>
          {renderActiveQueue()}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(editingOrder && editDraft)}
        transparent
        animationType="slide"
        onRequestClose={closeMenuEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle}>Update order menu</Text>
                <Text style={styles.modalSubtitle}>
                  {editingOrder
                    ? `${getCustomerLabel(editingOrder, dashboardData.customersById)} • Order #${editingOrder.order_id}`
                    : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={closeMenuEditor} activeOpacity={0.7}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            {editDraft ? (
              <ScrollView
                contentContainerStyle={styles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.stepperRow}>
                  <Text style={styles.stepperLabel}>Boxes</Text>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => updateDraftBoxCount(editDraft.boxCount - 1)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{editDraft.boxCount}</Text>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => updateDraftBoxCount(editDraft.boxCount + 1)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.boxTabRow}>
                  {editDraft.boxes.map((box, index) => {
                    const isActive = index === activeEditBoxIndex;
                    return (
                      <TouchableOpacity
                        key={`box-tab-${box.boxNumber}`}
                        style={[
                          styles.boxTab,
                          isActive ? styles.boxTabActive : null,
                        ]}
                        onPress={() => setActiveEditBoxIndex(index)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.boxTabText,
                            isActive ? styles.boxTabTextActive : null,
                          ]}
                        >
                          Box {box.boxNumber}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.editorHint}>
                  Box {currentEditBox?.boxNumber || 1} has{" "}
                  {currentEditBox?.selectedItemIds.length || 0} selected item
                  {(currentEditBox?.selectedItemIds.length || 0) === 1 ? "" : "s"}.
                </Text>

                {itemsByCategory.map(([category, items]) => (
                  <View key={category} style={styles.categorySection}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                    <View style={styles.chipWrap}>
                      {items.map((item) => {
                        const normalizedId = normalizeDraftItemId(item.id);
                        const isSelected =
                          currentEditBox?.selectedItemIds.includes(normalizedId);

                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.itemChip,
                              isSelected ? styles.itemChipSelected : null,
                            ]}
                            onPress={() => toggleDraftItem(item.id)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.itemChipText,
                                isSelected ? styles.itemChipTextSelected : null,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

                <Text style={styles.inputLabel}>Special instructions</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Any substitutions or admin notes to keep with the order..."
                  placeholderTextColor={theme.colors.mutedText}
                  multiline
                  numberOfLines={4}
                  value={editDraft.userNotes}
                  onChangeText={(text) =>
                    setEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            userNotes: text,
                          }
                        : current,
                    )
                  }
                />

                <View style={styles.modalActions}>
                  <AppButton
                    title="Save Menu Changes"
                    onPress={handleSaveMenuChanges}
                    disabled={busyKey === `save-menu-${editingOrder?.order_id}`}
                    style={styles.modalActionButton}
                  />
                  <AppButton
                    title="Discard"
                    variant="ghost"
                    onPress={closeMenuEditor}
                    disabled={busyKey === `save-menu-${editingOrder?.order_id}`}
                    style={styles.modalActionButton}
                  />
                </View>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(focusedComplaint)}
        transparent
        animationType="fade"
        onRequestClose={() => setFocusedComplaint(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {focusedComplaint && focusedComplaintMeta && focusedComplaintStatusMeta ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleBlock}>
                    <Text style={styles.modalTitle}>{focusedComplaintMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Order #{focusedComplaint.order_id} • {formatTimestamp(focusedComplaint.created_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setFocusedComplaint(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalClose}>Close</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.complaintDetailBadges}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: focusedComplaintMeta.backgroundColor,
                        borderColor: focusedComplaintMeta.borderColor,
                      },
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {focusedComplaintMeta.severity} severity
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: focusedComplaintStatusMeta.backgroundColor,
                        borderColor: focusedComplaintStatusMeta.borderColor,
                      },
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {focusedComplaintStatusMeta.label}
                    </Text>
                  </View>
                </View>

                <ScrollView contentContainerStyle={styles.modalContent}>
                  <Text style={styles.queueLabel}>Who is involved</Text>
                  <Text style={styles.queueValue}>
                    {focusedComplaint.reporter_role} reporting{" "}
                    {focusedComplaint.reported_role}
                  </Text>

                  <Text style={styles.queueLabel}>Recommended handling</Text>
                  <Text style={styles.queueValue}>
                    {focusedComplaintMeta.queueSummary}
                  </Text>

                  <Text style={styles.queueLabel}>Complaint details</Text>
                  <Text style={styles.queueValue}>
                    {focusedComplaint.description || "No extra details were included."}
                  </Text>

                  {focusedComplaintOrder ? (
                    <>
                      <Text style={styles.queueLabel}>Related order status</Text>
                      <Text style={styles.queueValue}>
                        {getOrderStatusBadge(focusedComplaintOrder).label} •{" "}
                        {getCustomerLabel(
                          focusedComplaintOrder,
                          dashboardData.customersById,
                        )}
                      </Text>

                      <Text style={styles.queueLabel}>Order snapshot</Text>
                      <Text style={styles.queueValue}>
                        {focusedComplaintOrderSummary?.boxCount || 1} box
                        {(focusedComplaintOrderSummary?.boxCount || 1) === 1 ? "" : "es"}{" "}
                        •{" "}
                        {focusedComplaintOrderSummary?.itemLabels?.length
                          ? focusedComplaintOrderSummary.itemLabels.join(", ")
                          : "No item selections saved yet."}
                      </Text>
                    </>
                  ) : null}

                  <View style={styles.modalActions}>
                    {focusedComplaint.status === "pending" ? (
                      <AppButton
                        title="Mark Under Review"
                        variant="secondary"
                        onPress={() =>
                          handleSetReportStatus(focusedComplaint, "reviewed")
                        }
                        disabled={
                          busyKey === `report-${focusedComplaint.order_id}-reviewed`
                        }
                        style={styles.modalActionButton}
                      />
                    ) : null}

                    {focusedComplaint.status !== "escalated" ? (
                      <AppButton
                        title="Escalate"
                        variant="ghost"
                        onPress={() =>
                          handleSetReportStatus(focusedComplaint, "escalated")
                        }
                        disabled={
                          busyKey === `report-${focusedComplaint.order_id}-escalated`
                        }
                        style={styles.modalActionButton}
                      />
                    ) : null}

                    <AppButton
                      title="Resolve"
                      onPress={() =>
                        handleSetReportStatus(focusedComplaint, "resolved")
                      }
                      disabled={
                        busyKey === `report-${focusedComplaint.order_id}-resolved`
                      }
                      style={styles.modalActionButton}
                    />
                  </View>
                </ScrollView>
              </>
            ) : null}
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
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  hero: {
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
  heroCopy: {
    marginBottom: theme.spacing.lg,
  },
  heroActions: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  heroButton: {
    flex: 1,
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
    fontSize: 30,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  heroNote: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  heroNoteText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  lastUpdatedText: {
    marginTop: theme.spacing.sm,
    fontSize: 13,
    color: theme.colors.mutedText,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  metricCard: {
    width: "48%",
    minWidth: 150,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  metricAccent: {
    width: 44,
    height: 6,
    borderRadius: theme.radius.pill,
    marginBottom: theme.spacing.md,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  metricLabel: {
    fontSize: 14,
    color: theme.colors.mutedText,
    lineHeight: 20,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  segmentTextActive: {
    color: theme.colors.primaryText,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.mutedText,
    lineHeight: 21,
    marginBottom: theme.spacing.lg,
  },
  queueCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  queueCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  queueCardTitleBlock: {
    flex: 1,
  },
  queueCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  queueCardMeta: {
    fontSize: 13,
    color: theme.colors.mutedText,
  },
  queueLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.colors.labelText,
    marginBottom: 2,
    marginTop: theme.spacing.sm,
  },
  queueValue: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  badge: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
    textTransform: "capitalize",
  },
  complaintBadges: {
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  inlineAction: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    padding: theme.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  modalTitleBlock: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
  },
  modalSubtitle: {
    marginTop: theme.spacing.xs,
    fontSize: 14,
    color: theme.colors.mutedText,
    lineHeight: 20,
  },
  modalClose: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  modalContent: {
    paddingBottom: theme.spacing.sm,
  },
  stepperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  stepperLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 24,
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    minWidth: 18,
    textAlign: "center",
  },
  boxTabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  boxTab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  boxTabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  boxTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  boxTabTextActive: {
    color: theme.colors.primaryText,
  },
  editorHint: {
    fontSize: 13,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.lg,
  },
  categorySection: {
    marginBottom: theme.spacing.lg,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  itemChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  itemChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  itemChipText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "600",
  },
  itemChipTextSelected: {
    color: theme.colors.primaryText,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    minHeight: 110,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text,
    textAlignVertical: "top",
  },
  modalActions: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  modalActionButton: {
    width: "100%",
  },
  complaintDetailBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
});
