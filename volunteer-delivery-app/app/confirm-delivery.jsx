import { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import AppButton from "../components/AppButton";
import ReportConcernModal from "../components/ReportConcernModal";
import {
  parseOrderNotes,
  updateOrderTracking,
} from "../lib/orderSelectionWorkaround";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

export default function ConfirmDelivery() {
  const router = useRouter();
  const { name = "", address = "", order } = useLocalSearchParams();
  const [modalVisible, setModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const [orderDetails] = useState(() => {
    if (!order) return {};

    try {
      return JSON.parse(order);
    } catch {
      return {};
    }
  });

  const displayDate = orderDetails.delivery_date || orderDetails.created_at || "";
  const parsedNotes = parseOrderNotes(orderDetails.notes);
  const fallbackItems = [
    orderDetails.item_milk ? "Milk" : null,
    orderDetails.item_pb ? "Peanut butter" : null,
    orderDetails.item_mac_cheese ? "Mac & cheese" : null,
  ].filter(Boolean);
  const itemsToShow =
    parsedNotes.selectedItems.length > 0 ? parsedNotes.selectedItems : fallbackItems;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;

  const openMaps = () => {
    Linking.openURL(mapsUrl).catch((error) =>
      console.error("Failed to open maps", error)
    );
  };

  const handleConfirmDelivery = async () => {
    if (!orderDetails.order_id) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "delivered" })
      .eq("order_id", orderDetails.order_id);

    if (error) {
      console.error("Error updating order:", error);
      return;
    }

    setModalVisible(false);
    router.push("/volunteer-dashboard");
  };

  const handleCancelDelivery = async () => {
    if (!orderDetails.order_id) return;

    const nextNotes = updateOrderTracking(orderDetails.notes, {
      volunteerCoords: null,
    });

    const { error } = await supabase
      .from("orders")
      .update({ status: "pending", volunteer_uid: null, notes: nextNotes })
      .eq("order_id", orderDetails.order_id);

    if (error) {
      console.error("Error updating order:", error);
      return;
    }

    setCancelModalVisible(false);
    router.push("/volunteer-dashboard");
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.nameText}>{name || "Recipient Name"}</Text>
        {displayDate ? (
          <Text style={styles.dateText}>
            {new Date(displayDate).toLocaleDateString()}
          </Text>
        ) : null}
        <TouchableOpacity onPress={openMaps}>
          <Text style={styles.addressText}>{address || "Delivery address"}</Text>
        </TouchableOpacity>

        {itemsToShow.length > 0 ? (
          <Text style={styles.detailText}>Items: {itemsToShow.join(", ")}</Text>
        ) : null}
        <Text style={styles.detailText}>
          Notes: {parsedNotes.userNotes || "None"}
        </Text>

        <AppButton
          title="Confirm Delivery"
          onPress={() => setModalVisible(true)}
          style={{ marginTop: theme.spacing.md }}
        />
        <AppButton
          title="Cancel Delivery"
          onPress={() => setCancelModalVisible(true)}
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
        />
        <AppButton
          title="Report Concern"
          onPress={() => setReportModalVisible(true)}
          variant="secondary"
          style={{
            marginTop: theme.spacing.md,
            borderColor: "#ffffff",
            backgroundColor: "#888888",
          }}
          textStyle={{ color: "#ffffff" }}
        />
        <TouchableOpacity
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push("/volunteer-dashboard")}
        >
          <Text style={styles.backText}>Back to dashboard</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>
              Are you sure you want to confirm this delivery?
            </Text>
            <View style={styles.modalButtons}>
              <AppButton
                title="Yes"
                onPress={handleConfirmDelivery}
                style={{ marginRight: theme.spacing.sm }}
              />
              <AppButton
                title="No"
                variant="secondary"
                onPress={() => setModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>
              Are you sure you want to cancel this delivery?
            </Text>
            <View style={styles.modalButtons}>
              <AppButton
                title="Yes"
                onPress={handleCancelDelivery}
                style={{ marginRight: theme.spacing.sm }}
              />
              <AppButton
                title="No"
                variant="secondary"
                onPress={() => setCancelModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ReportConcernModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        orderId={orderDetails.order_id}
        reportedId={orderDetails.customer_uid}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55,
  },
  infoContainer: {
    padding: theme.spacing.lg,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    marginTop: 50,
  },
  nameText: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  dateText: {
    fontSize: 18,
    color: theme.colors.mutedText,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  addressText: {
    fontSize: 18,
    color: theme.colors.primary,
    textAlign: "center",
    textDecorationLine: "underline",
    marginBottom: theme.spacing.sm,
  },
  detailText: {
    fontSize: 20,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  backText: {
    fontSize: 16,
    color: theme.colors.secondary,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    borderRadius: 10,
    alignItems: "center",
  },
  modalText: {
    fontSize: 18,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
  },
});
