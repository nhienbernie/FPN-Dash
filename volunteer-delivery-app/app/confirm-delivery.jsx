import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../theme";
import { supabase } from "../services/supabase";
import AppButton from "../components/AppButton";

export default function ConfirmDelivery() {
  const router = useRouter();
  const { name = "", address = "", order } = useLocalSearchParams();
  const [modalVisible, setModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);

  // attempt to pull a date field from the passed order (created_at or delivery_date)
  const [displayDate] = useState(() => {
    if (order) {
      try {
        const o = JSON.parse(order);
        return o.delivery_date || o.created_at || "";
      } catch {
        return "";
      }
    }
    return "";
  });

  const [orderDetails] = useState(() => {
    if (order) {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    }
    return {};
  });

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;

  const openMaps = () => {
    Linking.openURL(mapsUrl).catch((err) => console.error("Failed to open maps", err));
  };

  const handleConfirmDelivery = async () => {
    if (order) {
      try {
        const o = JSON.parse(order);
        const { error } = await supabase
          .from("orders")
          .update({ status: "delivered" })
          .eq("order_id", o.order_id);
        if (error) {
          console.error("Error updating order:", error);
        } else {
          setModalVisible(false);
          router.push("/volunteer-dashboard");
        }
      } catch (e) {
        console.error("Error parsing order:", e);
      }
    }
  };

  const handleCancelDelivery = async () => {
    if (order) {
      try {
        const o = JSON.parse(order);
        const { error } = await supabase
          .from("orders")
          .update({ status: "pending", volunteer_uid: null })
          .eq("order_id", o.order_id);
        if (error) {
          console.error("Error updating order:", error);
        } else {
          setCancelModalVisible(false);
          router.push("/volunteer-dashboard");
        }
      } catch (e) {
        console.error("Error parsing order:", e);
      }
    }
  };

  // geocode address when it changes, using our internal API route

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.nameText}>{name || "Recipient Name"}</Text>
        {displayDate ? (
          <Text style={styles.dateText}>{new Date(displayDate).toLocaleDateString()}</Text>
        ) : null}
        <TouchableOpacity onPress={openMaps}>
          <Text style={styles.addressText}>{address || "Delivery address"}</Text>
        </TouchableOpacity>
        <Text style={styles.detailText}>
          Item Milk: {orderDetails.item_milk ? "Yes" : "No"}
        </Text>
        <Text style={styles.detailText}>
          Item PB: {orderDetails.item_pb ? "Yes" : "No"}
        </Text>
        <Text style={styles.detailText}>
          Item Mac & Cheese: {orderDetails.item_mac_cheese ? "Yes" : "No"}
        </Text>
        <Text style={styles.detailText}>
          Notes: {orderDetails.notes || "None"}
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
            <Text style={styles.modalText}>Are you sure you want to confirm this delivery?</Text>
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
            <Text style={styles.modalText}>Are you sure you want to cancel this delivery?</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  infoContainer: {
    padding: theme.spacing.lg,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
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
