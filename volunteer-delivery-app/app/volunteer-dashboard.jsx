import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  View
} from "react-native";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { ensureVolunteerProfile } from "../lib/volunteerProfile";
import { theme } from "../theme";

export default function VolunteerDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [hasVolunteerProfile, setHasVolunteerProfile] = useState(true);
  const [profileMessage, setProfileMessage] = useState("");
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const router = useRouter();

  const timeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - new Date(date);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `${hours} hours ago`;
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} minutes ago`;
  };

  const fetchOrders = async () => {
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
        volunteerProfileResult.message
      );
      setHasVolunteerProfile(false);
      setProfileMessage(
        volunteerProfileResult.message ||
          "This account does not have a matching volunteer profile yet."
      );
      setOrders([]);
      setLoading(false);
      return;
    }

    setHasVolunteerProfile(true);
    setProfileMessage(
      volunteerProfileResult.status === "created"
        ? "We restored your volunteer profile automatically."
        : ""
    );

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(`status.eq.pending,volunteer_uid.eq.${user.id}`);

    if (error) {
      console.error("Error fetching orders:", error);
    } else {
      // Sort orders: pending first, then awaiting delivery, then delivered
      const sortedData = data.sort((a, b) => {
        const statusOrder = { pending: 1, "awaiting delivery": 2, delivered: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      });
      setOrders(sortedData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // when selectedOrder is set, show modal and slide up
  useEffect(() => {
    if (selectedOrder) {
      setModalVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedOrder, slideAnim]);

  const handleClose = () => {
    // slide down then hide
    Animated.timing(slideAnim, {
      toValue: Dimensions.get("window").height,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      setSelectedOrder(null);
    });
  };

  const renderItem = ({ item }) => {
    const isAccepted = item.status && item.status.toLowerCase() === "awaiting delivery";
    const isUrgent = item.status === "pending" && item.created_at && (new Date() - new Date(item.created_at)) > 2 * 60 * 60 * 1000;
    const isDelivered = item.status === "delivered";
    const backgroundColor = isAccepted ? "#FD9A3A" : isUrgent ? "#ff572d" : isDelivered ? "#90EE90" : "#FEF3C7";

    return (
      <View style={[styles.orderItem, { backgroundColor }]}>
        <View style={styles.topRow}>
          <Text style={styles.orderName}>{item.name}</Text>
          <Text style={[styles.timestamp, isUrgent && { color: '#000000' }]}>
            {item.created_at
              ? timeAgo(item.created_at)
              : ""}
          </Text>
        </View>
        <Text style={[styles.status, isUrgent && { color: '#000000', fontWeight: 'bold' }]}>
          {isUrgent ? "Status: Urgent" : item.status}
        </Text>
        {!isDelivered && (
          <AppButton
            title={isAccepted ? "Accepted" : "Accept"}
            variant={isAccepted ? "secondary" : "primary"}
            style={{ backgroundColor: 'black' }}  // Custom background color
            textStyle={{ color: 'white' }}      // Custom text color
            onPress={() => setSelectedOrder(item)}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      {hasVolunteerProfile && profileMessage ? (
        <Text style={styles.status}>{profileMessage}</Text>
      ) : null}
      {loading ? (
        <Text>Loading…</Text>
      ) : !hasVolunteerProfile ? (
        <Text style={styles.status}>
          {profileMessage ||
            "This account is signed in, but it does not have a matching volunteer profile in the database yet."}
        </Text>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.order_id || Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        {/* overlay + container center the content */}
        <View style={styles.modalContainer}>
          <Animated.View
            style={[
              styles.modalContent,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {selectedOrder && (
              <>
                <Text style={styles.detailText}>
                  Name: {selectedOrder.name}
                </Text>
                <Text style={styles.detailText}>
                  Status: {selectedOrder.status}
                </Text>
                <Text style={styles.detailText}>
                  Address: {selectedOrder.delivery_address}
                </Text>
                <Text style={styles.detailText}>
                  Item Milk: {selectedOrder.item_milk ? "Yes" : "No"}
                </Text>
                <Text style={styles.detailText}>
                  Item PB: {selectedOrder.item_pb ? "Yes" : "No"}
                </Text>
                {
                <Text style={styles.detailText}>
                  Item Mac & Cheese: {selectedOrder.item_mac_cheese ? "Yes" : "No"}
                </Text>
                }
                <Text style={styles.detailText}>
                  Notes: {selectedOrder.notes || "None"}
                </Text>
              </>
            )}

            <AppButton
              title="Confirm order"
              onPress={async () => {
                const { data: { user } } = await supabase.auth.getUser();

                const { error } = await supabase
                  .from("orders")
                  .update({ status: "awaiting delivery", volunteer_uid: user.id })
                  .eq("order_id", selectedOrder.order_id);

                if (error) {
                  console.error("Error updating order:", error);
                } else {
                  fetchOrders();
                }

                handleClose();
                if (selectedOrder) {
                  router.push({
                    pathname: "/confirm-delivery",
                    params: {
                      name: selectedOrder.name,
                      address: selectedOrder.delivery_address,
                      order: JSON.stringify(selectedOrder),
                    },
                  });
                } else {
                  router.push("/confirm-delivery");
                }
              }}
            />

            <AppButton
              title="Close"
              variant="secondary"
              style={{ marginTop: theme.spacing.md }}
              onPress={handleClose}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
    marginTop: 50
  },
  orderItem: {
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    // backgroundColor is set dynamically based on status
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  // top row for name and timestamp
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  orderText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: "600",
  },
  orderName: {
    fontSize: 30,
    color: theme.colors.text,
    fontWeight: "bold",
  },
  timestamp: {
    fontSize: 14,
    color: theme.colors.mutedText,
  },
  status: {
    fontSize: 14,
    color: theme.colors.mutedText,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  orderSubText: {
    fontSize: 14,
    color: theme.colors.mutedText,
    // marginBottom moved to orderRow for spacing
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    width: '90%',

  },
  detailText: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
});
