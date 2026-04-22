import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppButton from "../components/AppButton";
import { ORDER_STATUS, getOrderStatusMeta } from "../lib/orderStatus";
import { updateOrderTracking } from "../lib/orderSelectionWorkaround";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const REPORT_REASON_LABELS = {
  no_show: "No show",
  harassment: "Harassment",
  unsafe: "Unsafe situation",
  other: "Other",
};

const ACTIVE_ORDER_STATUSES = [ORDER_STATUS.ACCEPTED, ORDER_STATUS.IN_TRANSIT];

function formatPersonName(row) {
  const first = String(row?.first_name ?? "").trim();
  const last = String(row?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unknown";
}

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function buildAddressSummary(value) {
  if (!value) return "No address saved";
  return String(value);
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [dashboardData, setDashboardData] = useState({
    metrics: {
      pendingOrders: 0,
      activeOrders: 0,
      deliveredOrders: 0,
      volunteerCount: 0,
      customerCount: 0,
      pendingReports: 0,
    },
    recentOrders: [],
    recentReports: [],
    volunteers: [],
    customers: [],
  });

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [
        pendingOrdersCountResult,
        activeOrdersCountResult,
        deliveredOrdersCountResult,
        volunteerCountResult,
        customerCountResult,
        pendingReportsCountResult,
        recentOrdersResult,
        recentReportsResult,
        volunteersResult,
        customersResult,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", ORDER_STATUS.PENDING),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .in("status", ACTIVE_ORDER_STATUSES),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", ORDER_STATUS.DELIVERED),
        supabase.from("volunteers").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase
          .from("reports")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("orders")
          .select(
            "order_id, status, created_at, delivery_address, customer_uid, volunteer_uid, box_count, notes",
          )
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("reports")
          .select(
            "order_id, reporter_id, reported_id, reporter_role, reported_role, reason, description, status, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("volunteers")
          .select("uid, first_name, last_name, email, phone_number, zip")
          .order("first_name", { ascending: true })
          .limit(6),
        supabase
          .from("customers")
          .select("uid, first_name, last_name, phone_number, address")
          .order("first_name", { ascending: true })
          .limit(6),
      ]);

      const possibleErrors = [
        pendingOrdersCountResult.error,
        activeOrdersCountResult.error,
        deliveredOrdersCountResult.error,
        volunteerCountResult.error,
        customerCountResult.error,
        pendingReportsCountResult.error,
        recentOrdersResult.error,
        recentReportsResult.error,
        volunteersResult.error,
        customersResult.error,
      ].filter(Boolean);

      if (possibleErrors.length > 0) {
        throw new Error(possibleErrors[0].message);
      }

      setDashboardData({
        metrics: {
          pendingOrders: pendingOrdersCountResult.count ?? 0,
          activeOrders: activeOrdersCountResult.count ?? 0,
          deliveredOrders: deliveredOrdersCountResult.count ?? 0,
          volunteerCount: volunteerCountResult.count ?? 0,
          customerCount: customerCountResult.count ?? 0,
          pendingReports: pendingReportsCountResult.count ?? 0,
        },
        recentOrders: recentOrdersResult.data ?? [],
        recentReports: recentReportsResult.data ?? [],
        volunteers: volunteersResult.data ?? [],
        customers: customersResult.data ?? [],
      });
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

  const handleAdvanceOrder = async (order) => {
    const nextStatus =
      order.status === ORDER_STATUS.ACCEPTED
        ? ORDER_STATUS.IN_TRANSIT
        : order.status === ORDER_STATUS.IN_TRANSIT
          ? ORDER_STATUS.DELIVERED
          : null;

    if (!nextStatus) {
      return;
    }

    setBusyKey(`order-advance-${order.order_id}`);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("order_id", order.order_id)
        .eq("status", order.status);

      if (error) {
        throw error;
      }

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error advancing order:", error);
      Alert.alert("Order Update Failed", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
  };

  const handleReleaseOrder = async (order) => {
    setBusyKey(`order-release-${order.order_id}`);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: ORDER_STATUS.PENDING,
          volunteer_uid: null,
          notes: updateOrderTracking(order.notes, {
            volunteerCoords: null,
          }),
        })
        .eq("order_id", order.order_id);

      if (error) {
        throw error;
      }

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error releasing order:", error);
      Alert.alert("Order Reset Failed", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
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

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error updating report status:", error);
      Alert.alert("Report Update Failed", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
  };

  const metricCards = useMemo(
    () => [
      {
        label: "Pending Orders",
        value: dashboardData.metrics.pendingOrders,
        accent: theme.colors.secondary,
      },
      {
        label: "Active Deliveries",
        value: dashboardData.metrics.activeOrders,
        accent: theme.colors.primary,
      },
      {
        label: "Delivered Today-ish",
        value: dashboardData.metrics.deliveredOrders,
        accent: theme.colors.successText,
      },
      {
        label: "Volunteers",
        value: dashboardData.metrics.volunteerCount,
        accent: theme.colors.infoText,
      },
      {
        label: "Customers",
        value: dashboardData.metrics.customerCount,
        accent: theme.colors.text,
      },
      {
        label: "Pending Reports",
        value: dashboardData.metrics.pendingReports,
        accent: theme.colors.danger,
      },
    ],
    [dashboardData.metrics],
  );

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
            <Text style={styles.eyebrow}>Admin Demo</Text>
            <Text style={styles.title}>Operations dashboard for the MVP demo.</Text>
            <Text style={styles.subtitle}>
              This view stays open-access for now, but it works against the real
              tables your app already uses.
            </Text>
          </View>
          <View style={styles.heroActions}>
            <AppButton
              title="Refresh Data"
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

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          <Text style={styles.sectionSubtitle}>
            Advance deliveries or release assigned orders back to the queue.
          </Text>

          {loading ? (
            <Text style={styles.emptyText}>Loading order activity...</Text>
          ) : dashboardData.recentOrders.length === 0 ? (
            <Text style={styles.emptyText}>No orders found yet.</Text>
          ) : (
            dashboardData.recentOrders.map((order) => {
              const statusMeta = getOrderStatusMeta(order.status);
              const canAdvance = ACTIVE_ORDER_STATUSES.includes(order.status);
              const advanceLabel =
                order.status === ORDER_STATUS.ACCEPTED
                  ? "Advance to In Transit"
                  : "Mark Delivered";

              return (
                <View key={order.order_id} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemTitle}>Order #{order.order_id}</Text>
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

                  <Text style={styles.itemMeta}>
                    Created: {formatTimestamp(order.created_at)}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Boxes requested: {order.box_count ?? 0}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Delivery address: {buildAddressSummary(order.delivery_address)}
                  </Text>

                  {canAdvance ? (
                    <View style={styles.actionRow}>
                      <AppButton
                        title={advanceLabel}
                        onPress={() => handleAdvanceOrder(order)}
                        disabled={busyKey === `order-advance-${order.order_id}`}
                        style={styles.inlineAction}
                      />
                      <AppButton
                        title="Release Order"
                        variant="ghost"
                        onPress={() => handleReleaseOrder(order)}
                        disabled={busyKey === `order-release-${order.order_id}`}
                        style={styles.inlineAction}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Reports</Text>
          <Text style={styles.sectionSubtitle}>
            Triage volunteer-submitted concerns from the dashboard.
          </Text>

          {loading ? (
            <Text style={styles.emptyText}>Loading reports...</Text>
          ) : dashboardData.recentReports.length === 0 ? (
            <Text style={styles.emptyText}>No reports have been submitted.</Text>
          ) : (
            dashboardData.recentReports.map((report) => (
              <View key={`${report.order_id}-${report.created_at}`} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemTitle}>
                    {REPORT_REASON_LABELS[report.reason] || report.reason || "Concern"}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      report.status === "pending"
                        ? styles.badgePending
                        : styles.badgeResolved,
                    ]}
                  >
                    <Text style={styles.badgeText}>{report.status}</Text>
                  </View>
                </View>

                <Text style={styles.itemMeta}>
                  Order #{report.order_id} from {report.reporter_role} about{" "}
                  {report.reported_role}
                </Text>
                <Text style={styles.itemMeta}>
                  Submitted: {formatTimestamp(report.created_at)}
                </Text>
                {report.description ? (
                  <Text style={styles.itemBody}>{report.description}</Text>
                ) : (
                  <Text style={styles.itemBodyMuted}>
                    No extra details were included.
                  </Text>
                )}

                {report.status === "pending" ? (
                  <View style={styles.actionRow}>
                    <AppButton
                      title="Mark Reviewed"
                      variant="secondary"
                      onPress={() => handleSetReportStatus(report, "reviewed")}
                      disabled={
                        busyKey === `report-${report.order_id}-reviewed`
                      }
                      style={styles.inlineAction}
                    />
                    <AppButton
                      title="Resolve"
                      variant="ghost"
                      onPress={() => handleSetReportStatus(report, "resolved")}
                      disabled={
                        busyKey === `report-${report.order_id}-resolved`
                      }
                      style={styles.inlineAction}
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.dualColumn}>
          <View style={styles.sectionCardCompact}>
            <Text style={styles.sectionTitle}>Volunteer Directory</Text>
            {loading ? (
              <Text style={styles.emptyText}>Loading volunteers...</Text>
            ) : (
              dashboardData.volunteers.map((volunteer) => (
                <View key={volunteer.uid} style={styles.directoryRow}>
                  <Text style={styles.directoryName}>
                    {formatPersonName(volunteer)}
                  </Text>
                  <Text style={styles.directoryMeta}>{volunteer.email}</Text>
                  <Text style={styles.directoryMeta}>
                    {volunteer.phone_number || "No phone"} | ZIP {volunteer.zip || "N/A"}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCardCompact}>
            <Text style={styles.sectionTitle}>Customer Directory</Text>
            {loading ? (
              <Text style={styles.emptyText}>Loading customers...</Text>
            ) : (
              dashboardData.customers.map((customer) => (
                <View key={customer.uid} style={styles.directoryRow}>
                  <Text style={styles.directoryName}>
                    {formatPersonName(customer)}
                  </Text>
                  <Text style={styles.directoryMeta}>
                    {customer.phone_number || "No phone on file"}
                  </Text>
                  <Text style={styles.directoryMeta}>
                    {buildAddressSummary(customer.address)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
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
    gap: theme.spacing.md,
  },
  heroButton: {
    width: "100%",
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
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  sectionCardCompact: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    minWidth: 0,
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
  itemCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  itemMeta: {
    fontSize: 14,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.xs,
    lineHeight: 20,
  },
  itemBody: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 21,
    marginTop: theme.spacing.sm,
  },
  itemBodyMuted: {
    fontSize: 14,
    color: theme.colors.mutedText,
    lineHeight: 21,
    marginTop: theme.spacing.sm,
    fontStyle: "italic",
  },
  badge: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgePending: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  badgeResolved: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
    textTransform: "capitalize",
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  inlineAction: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  dualColumn: {
    gap: theme.spacing.lg,
  },
  directoryRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  directoryName: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  directoryMeta: {
    fontSize: 13,
    color: theme.colors.mutedText,
    lineHeight: 19,
  },
});
