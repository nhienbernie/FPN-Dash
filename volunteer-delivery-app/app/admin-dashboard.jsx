import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  buildMenuSections,
  buildQueueHeadline,
  formatElapsedSince,
  formatQueueAge,
  generateMenuItemKey,
  getCustomerLabel,
  getOrderStatusBadge,
  getOrderSummary,
  getReportReasonMeta,
  getReportStatusMeta,
  isComplaintOpen,
  isOrderCancellable,
} from "../lib/adminDashboard";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "password";
const ADMIN_AUTH_STORAGE_KEY = "admin-dashboard-authenticated";

const TAB_COPY = {
  menu: {
    title: "Menu setup",
    subtitle:
      "Manage the global requester menu by editing sections and the items inside them.",
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

export default function AdminDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [activeTab, setActiveTab] = useState("menu");
  const [focusedComplaint, setFocusedComplaint] = useState(null);
  const [sectionEditor, setSectionEditor] = useState(null);
  const [itemEditor, setItemEditor] = useState(null);
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
          .select("id, key, label, category, active")
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
    let isMounted = true;

    const restoreAdminSession = async () => {
      try {
        const savedValue = await AsyncStorage.getItem(ADMIN_AUTH_STORAGE_KEY);

        if (isMounted) {
          setIsAuthenticated(savedValue === "true");
        }
      } catch (error) {
        console.error("Error restoring admin auth:", error);
      } finally {
        if (isMounted) {
          setAuthReady(true);
        }
      }
    };

    restoreAdminSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      return;
    }

    loadDashboard();
  }, [authReady, isAuthenticated, loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard({ silent: true });
  };

  const handleLogin = async () => {
    const username = credentials.username.trim();
    const password = credentials.password;

    if (!username || !password) {
      setLoginError("Enter the admin username and password.");
      return;
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setLoginError("Incorrect username or password.");
      return;
    }

    setAuthBusy(true);
    setLoginError("");

    try {
      await AsyncStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "true");
      setIsAuthenticated(true);
      setCredentials({
        username: "",
        password: "",
      });
    } catch (error) {
      console.error("Error saving admin auth:", error);
      setLoginError("Unable to save the admin session. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);

    try {
      await AsyncStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setLoginError("");
      setCredentials({
        username: "",
        password: "",
      });
      router.replace("/mode-select");
    } catch (error) {
      console.error("Error clearing admin auth:", error);
      Alert.alert("Unable to Log Out", "Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const metrics = useMemo(
    () =>
      buildAdminMetrics(
        dashboardData.orders,
        dashboardData.reports,
        dashboardData.itemCatalog,
      ),
    [dashboardData.orders, dashboardData.reports, dashboardData.itemCatalog],
  );

  const metricCards = useMemo(
    () =>
      metrics.filter((metric) =>
        ["liveSections", "liveItems", "cancellations", "openComplaints"].includes(
          metric.key,
        ),
      ),
    [metrics],
  );

  const queueHeadline = useMemo(() => buildQueueHeadline(metrics), [metrics]);

  const menuSections = useMemo(
    () => buildMenuSections(dashboardData.itemCatalog),
    [dashboardData.itemCatalog],
  );

  const ordersById = useMemo(
    () => Object.fromEntries(dashboardData.orders.map((order) => [order.order_id, order])),
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

  const currentTabCopy = TAB_COPY[activeTab];
  const currentSection = useMemo(() => {
    if (sectionEditor?.mode !== "manage") {
      return null;
    }

    return (
      menuSections.find((section) => section.name === sectionEditor.originalName) || null
    );
  }, [menuSections, sectionEditor]);

  const openCreateSection = () => {
    setSectionEditor({
      mode: "create",
      originalName: "",
      name: "",
      firstItemLabel: "",
    });
  };

  const openManageSection = (section) => {
    setSectionEditor({
      mode: "manage",
      originalName: section.name,
      name: section.name,
      firstItemLabel: "",
    });
  };

  const closeSectionEditor = () => {
    if (busyKey === "section-save") {
      return;
    }

    setSectionEditor(null);
  };

  const openCreateItem = (sectionName) => {
    setItemEditor({
      mode: "create",
      sectionName,
      itemId: null,
      label: "",
      active: true,
    });
  };

  const openEditItem = (item) => {
    setItemEditor({
      mode: "edit",
      sectionName: item.category || "Other",
      itemId: item.id,
      label: item.label || "",
      active: item.active !== false,
    });
  };

  const closeItemEditor = () => {
    if (busyKey === "item-save") {
      return;
    }

    setItemEditor(null);
  };

  const performSectionVisibilityUpdate = async (section, nextActive) => {
    setBusyKey(`section-toggle-${section.name}`);

    try {
      const { error } = await supabase
        .from("items")
        .update({ active: nextActive })
        .eq("category", section.name);

      if (error) {
        throw error;
      }

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error updating section visibility:", error);
      Alert.alert(
        nextActive ? "Unable to Restore Section" : "Unable to Hide Section",
        error.message || "Please try again.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const handleSaveSection = async () => {
    if (!sectionEditor) {
      return;
    }

    const trimmedName = sectionEditor.name.trim();
    if (!trimmedName) {
      Alert.alert("Missing Section Name", "Please enter a section name.");
      return;
    }

    const isDuplicate = menuSections.some((section) => {
      if (sectionEditor.mode === "manage" && section.name === sectionEditor.originalName) {
        return false;
      }

      return section.name.toLowerCase() === trimmedName.toLowerCase();
    });

    if (isDuplicate) {
      Alert.alert(
        "Section Already Exists",
        "Choose a different section name to avoid merging menu groups by accident.",
      );
      return;
    }

    setBusyKey("section-save");

    try {
      if (sectionEditor.mode === "create") {
        const firstItemLabel = sectionEditor.firstItemLabel.trim();

        if (!firstItemLabel) {
          throw new Error("A new section needs its first item label.");
        }

        const { error } = await supabase.from("items").insert({
          key: generateMenuItemKey(firstItemLabel),
          label: firstItemLabel,
          category: trimmedName,
          active: true,
        });

        if (error) {
          throw error;
        }
      } else if (trimmedName !== sectionEditor.originalName) {
        const { error } = await supabase
          .from("items")
          .update({ category: trimmedName })
          .eq("category", sectionEditor.originalName);

        if (error) {
          throw error;
        }
      }

      setSectionEditor(null);
      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error saving section:", error);
      Alert.alert(
        "Unable to Save Section",
        error.message || "Please try again.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const handleSaveItem = async () => {
    if (!itemEditor) {
      return;
    }

    const trimmedLabel = itemEditor.label.trim();
    if (!trimmedLabel) {
      Alert.alert("Missing Item Label", "Please enter an item label.");
      return;
    }

    setBusyKey("item-save");

    try {
      if (itemEditor.mode === "create") {
        const { error } = await supabase.from("items").insert({
          key: generateMenuItemKey(trimmedLabel),
          label: trimmedLabel,
          category: itemEditor.sectionName,
          active: true,
        });

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("items")
          .update({ label: trimmedLabel })
          .eq("id", itemEditor.itemId);

        if (error) {
          throw error;
        }
      }

      setItemEditor(null);
      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error saving item:", error);
      Alert.alert("Unable to Save Item", error.message || "Please try again.");
    } finally {
      setBusyKey("");
    }
  };

  const handleToggleItemVisibility = async (item, nextActive) => {
    setBusyKey(`item-toggle-${item.id}`);

    try {
      const { error } = await supabase
        .from("items")
        .update({ active: nextActive })
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      await loadDashboard({ silent: true });
    } catch (error) {
      console.error("Error updating item visibility:", error);
      Alert.alert(
        nextActive ? "Unable to Restore Item" : "Unable to Hide Item",
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

  const renderMenuSectionCard = (section) => {
    const previewItems = section.items
      .filter((item) => item.active)
      .slice(0, 4)
      .map((item) => item.label);
    const previewText =
      previewItems.length > 0
        ? previewItems.join(", ")
        : "No live items are currently visible to requesters.";

    return (
      <View key={section.name} style={styles.queueCard}>
        <View style={styles.queueCardHeader}>
          <View style={styles.queueCardTitleBlock}>
            <Text style={styles.queueCardTitle}>{section.name}</Text>
            <Text style={styles.queueCardMeta}>
              {section.activeItemCount} live item
              {section.activeItemCount === 1 ? "" : "s"}
              {section.inactiveItemCount > 0
                ? ` • ${section.inactiveItemCount} hidden`
                : ""}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              section.isVisible ? styles.badgeVisible : styles.badgeMuted,
            ]}
          >
            <Text style={styles.badgeText}>
              {section.isVisible ? "Visible" : "Hidden"}
            </Text>
          </View>
        </View>

        <Text style={styles.queueLabel}>Current requester view</Text>
        <Text style={styles.queueValue}>{previewText}</Text>

        <Text style={styles.queueLabel}>Admin note</Text>
        <Text style={styles.queueValue}>
          {section.isVisible
            ? "Requesters can see this section as long as it still has live items."
            : "This section is hidden right now. Restore one or more items to bring it back."}
        </Text>

        <View style={styles.actionRow}>
          <AppButton
            title="Manage Section"
            onPress={() => openManageSection(section)}
            style={styles.inlineAction}
          />
          <AppButton
            title={section.isVisible ? "Hide Section" : "Restore All"}
            variant="ghost"
            onPress={() => performSectionVisibilityUpdate(section, !section.isVisible)}
            disabled={busyKey === `section-toggle-${section.name}`}
            style={styles.inlineAction}
          />
        </View>
      </View>
    );
  };

  const renderCancellationCard = (order) => {
    const statusMeta = getOrderStatusBadge(order);
    const summary = getOrderSummary(order);
    const customerLabel = getCustomerLabel(order, dashboardData.customersById);
    const volunteerLabel = order.volunteer_uid
      ? dashboardData.volunteersById[order.volunteer_uid]
      : "";

    return (
      <View key={`cancel-${order.order_id}`} style={styles.queueCard}>
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
          {summary.boxCount} box{summary.boxCount === 1 ? "" : "es"} •{" "}
          {summary.itemLabels.length > 0
            ? summary.itemLabels.slice(0, 4).join(", ")
            : "No item selections saved yet."}
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
          <AppButton
            title="Cancel Order"
            variant="secondary"
            onPress={() => handleCancelOrder(order)}
            disabled={busyKey === `cancel-${order.order_id}`}
            style={styles.inlineAction}
          />
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
    if (activeTab === "menu") {
      if (loading) {
        return <Text style={styles.emptyText}>Loading menu sections...</Text>;
      }

      return (
        <>
          <View style={styles.menuSetupToolbar}>
            <AppButton
              title="Add Section"
              variant="secondary"
              onPress={openCreateSection}
              style={styles.menuToolbarButton}
            />
          </View>
          <Text style={styles.menuHelperText}>
            This first pass uses the existing items table. New sections need a first
            item, and hiding is safer than hard-deleting because old orders may still
            reference these menu items.
          </Text>
          {menuSections.length === 0 ? (
            <Text style={styles.emptyText}>
              No menu sections have been created yet.
            </Text>
          ) : (
            menuSections.map(renderMenuSectionCard)
          )}
        </>
      );
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

      return cancellationQueue.map(renderCancellationCard);
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

  if (!authReady) {
    return (
      <View style={styles.authShell}>
        <View style={styles.authCard}>
          <Text style={styles.eyebrow}>Admin Access</Text>
          <Text style={styles.title}>Checking saved admin session...</Text>
          <Text style={styles.subtitle}>
            Hold on while the dashboard verifies whether this device is already signed in.
          </Text>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.authShell}
      >
        <View style={styles.authCard}>
          <Text style={styles.eyebrow}>Admin Access</Text>
          <Text style={styles.title}>Sign in to open the dashboard.</Text>
          <Text style={styles.subtitle}>
            Use the single shared admin credential set for this demo view.
          </Text>

          <View style={styles.authHint}>
            <Text style={styles.authHintText}>Username: admin</Text>
            <Text style={styles.authHintText}>Password: password</Text>
          </View>

          <Text style={styles.inputLabel}>Username</Text>
          <TextInput
            style={styles.textInput}
            placeholder="admin"
            placeholderTextColor={theme.colors.mutedText}
            value={credentials.username}
            onChangeText={(text) => {
              setCredentials((current) => ({
                ...current,
                username: text,
              }));
              if (loginError) {
                setLoginError("");
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!authBusy}
            returnKeyType="next"
          />

          <Text style={[styles.inputLabel, styles.authPasswordLabel]}>Password</Text>
          <TextInput
            style={styles.textInput}
            placeholder="password"
            placeholderTextColor={theme.colors.mutedText}
            value={credentials.password}
            onChangeText={(text) => {
              setCredentials((current) => ({
                ...current,
                password: text,
              }));
              if (loginError) {
                setLoginError("");
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!authBusy}
            onSubmitEditing={() => {
              void handleLogin();
            }}
          />

          {loginError ? <Text style={styles.authErrorText}>{loginError}</Text> : null}

          <View style={styles.authActions}>
            <AppButton
              title={authBusy ? "Signing In..." : "Sign In"}
              onPress={() => {
                void handleLogin();
              }}
              disabled={authBusy}
              style={styles.modalActionButton}
            />
            <AppButton
              title="Back Home"
              variant="ghost"
              onPress={() => router.replace("/mode-select")}
              disabled={authBusy}
              style={styles.modalActionButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

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
              Prioritize menu setup, cancellations, and complaint handling before
              anything else.
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
            <AppButton
              title="Log Out"
              onPress={() => {
                void handleLogout();
              }}
              variant="danger"
              style={styles.heroButton}
              disabled={authBusy}
            />
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {metricCards.map((card) => (
            <View key={card.key} style={styles.metricCard}>
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
        visible={Boolean(sectionEditor)}
        transparent
        animationType="slide"
        onRequestClose={closeSectionEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            {sectionEditor ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleBlock}>
                    <Text style={styles.modalTitle}>
                      {sectionEditor.mode === "create"
                        ? "Create menu section"
                        : "Manage section"}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {sectionEditor.mode === "create"
                        ? "Add a new section and its first requester-visible item."
                        : `Section currently saved as ${sectionEditor.originalName}.`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeSectionEditor} activeOpacity={0.7}>
                    <Text style={styles.modalClose}>Close</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={styles.modalContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.inputLabel}>Section name</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Diet Restrictions"
                    placeholderTextColor={theme.colors.mutedText}
                    value={sectionEditor.name}
                    onChangeText={(text) =>
                      setSectionEditor((current) =>
                        current
                          ? {
                              ...current,
                              name: text,
                            }
                          : current,
                      )
                    }
                  />

                  {sectionEditor.mode === "create" ? (
                    <>
                      <Text style={styles.menuHelperText}>
                        Sections are discovered from the items table today, so a new
                        section needs its first item right away.
                      </Text>
                      <Text style={styles.inputLabel}>First item label</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Protein shake"
                        placeholderTextColor={theme.colors.mutedText}
                        value={sectionEditor.firstItemLabel}
                        onChangeText={(text) =>
                          setSectionEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  firstItemLabel: text,
                                }
                              : current,
                          )
                        }
                      />
                    </>
                  ) : currentSection ? (
                    <>
                      <View style={styles.sectionSummaryCard}>
                        <Text style={styles.queueLabel}>Section status</Text>
                        <Text style={styles.queueValue}>
                          {currentSection.isVisible
                            ? `${currentSection.activeItemCount} live item${currentSection.activeItemCount === 1 ? "" : "s"} visible to requesters.`
                            : "All items in this section are hidden right now."}
                        </Text>
                        <Text style={styles.queueLabel}>Hidden items</Text>
                        <Text style={styles.queueValue}>
                          {currentSection.inactiveItemCount} hidden item
                          {currentSection.inactiveItemCount === 1 ? "" : "s"}.
                        </Text>
                      </View>

                      <View style={styles.actionRow}>
                        <AppButton
                          title="Add Item"
                          variant="secondary"
                          onPress={() => openCreateItem(currentSection.name)}
                          style={styles.inlineAction}
                        />
                        <AppButton
                          title={currentSection.isVisible ? "Hide Section" : "Restore All"}
                          variant="ghost"
                          onPress={() =>
                            performSectionVisibilityUpdate(
                              currentSection,
                              !currentSection.isVisible,
                            )
                          }
                          disabled={busyKey === `section-toggle-${currentSection.name}`}
                          style={styles.inlineAction}
                        />
                      </View>

                      <Text style={styles.sectionItemsTitle}>Items in this section</Text>
                      {currentSection.items.map((item) => (
                        <View key={item.id} style={styles.itemRowCard}>
                          <View style={styles.itemRowTop}>
                            <View style={styles.itemRowText}>
                              <Text style={styles.itemRowTitle}>{item.label}</Text>
                              <Text style={styles.itemRowMeta}>
                                {item.active
                                  ? "Visible to requesters"
                                  : "Hidden from requesters"}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.badge,
                                item.active ? styles.badgeVisible : styles.badgeMuted,
                              ]}
                            >
                              <Text style={styles.badgeText}>
                                {item.active ? "Live" : "Hidden"}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.microActionRow}>
                            <TouchableOpacity
                              style={styles.microAction}
                              onPress={() => openEditItem(item)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.microActionText}>Rename</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.microAction}
                              onPress={() =>
                                handleToggleItemVisibility(item, !item.active)
                              }
                              activeOpacity={0.8}
                              disabled={busyKey === `item-toggle-${item.id}`}
                            >
                              <Text style={styles.microActionText}>
                                {item.active ? "Hide" : "Restore"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : null}

                  <View style={styles.modalActions}>
                    <AppButton
                      title={
                        sectionEditor.mode === "create"
                          ? "Create Section"
                          : "Save Section"
                      }
                      onPress={handleSaveSection}
                      disabled={busyKey === "section-save"}
                      style={styles.modalActionButton}
                    />
                    <AppButton
                      title="Close"
                      variant="ghost"
                      onPress={closeSectionEditor}
                      disabled={busyKey === "section-save"}
                      style={styles.modalActionButton}
                    />
                  </View>
                </ScrollView>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(itemEditor)}
        transparent
        animationType="fade"
        onRequestClose={closeItemEditor}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardCompact}>
            {itemEditor ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleBlock}>
                    <Text style={styles.modalTitle}>
                      {itemEditor.mode === "create" ? "Add menu item" : "Rename item"}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {itemEditor.sectionName}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeItemEditor} activeOpacity={0.7}>
                    <Text style={styles.modalClose}>Close</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Item label</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Sports drink"
                  placeholderTextColor={theme.colors.mutedText}
                  value={itemEditor.label}
                  onChangeText={(text) =>
                    setItemEditor((current) =>
                      current
                        ? {
                            ...current,
                            label: text,
                          }
                        : current,
                    )
                  }
                />

                <View style={styles.modalActions}>
                  <AppButton
                    title={itemEditor.mode === "create" ? "Add Item" : "Save Item"}
                    onPress={handleSaveItem}
                    disabled={busyKey === "item-save"}
                    style={styles.modalActionButton}
                  />
                  <AppButton
                    title="Close"
                    variant="ghost"
                    onPress={closeItemEditor}
                    disabled={busyKey === "item-save"}
                    style={styles.modalActionButton}
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
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
  authShell: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  authCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 4,
  },
  authHint: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.infoBg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  authHintText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.infoText,
  },
  authPasswordLabel: {
    marginTop: theme.spacing.lg,
  },
  authErrorText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.errorText,
  },
  authActions: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
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
    flexWrap: "wrap",
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
  menuSetupToolbar: {
    marginBottom: theme.spacing.md,
  },
  menuToolbarButton: {
    width: "100%",
  },
  menuHelperText: {
    fontSize: 13,
    color: theme.colors.mutedText,
    lineHeight: 20,
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
  badgeVisible: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  badgeMuted: {
    backgroundColor: "#F8FAFC",
    borderColor: theme.colors.border,
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
  modalCardCompact: {
    width: "100%",
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
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    minHeight: 54,
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
  sectionSummaryCard: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  sectionItemsTitle: {
    marginTop: theme.spacing.lg,
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  itemRowCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  itemRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  itemRowText: {
    flex: 1,
  },
  itemRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  itemRowMeta: {
    fontSize: 13,
    color: theme.colors.mutedText,
    lineHeight: 19,
  },
  microActionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  microAction: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  microActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
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
