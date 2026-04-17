import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useOrdersFeedSubscription } from "../lib/orderRealtime";
import { normalizeOrderStatus, ORDER_STATUS } from "../lib/orderStatus";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

export default function VolunteerDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [user, setUser] = useState(null);
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const router = useRouter();

  const applyOrder = useCallback((order) => {
    setOrders((prev) => {
      const existingIndex = prev.findIndex((o) => o.order_id === order.order_id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = order;
        return updated;
      } else {
        return [...prev, order];
      }
    });
  }, []);

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
    
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(`status.eq.pending,volunteer_uid.eq.${user.id}`);

    if (error) {
      console.error("Error fetching orders:", error);
    } else {
      // Sort orders: pending first, then accepted, then in_transit, then delivered
      const sortedData = data.sort((a, b) => {
        const statusOrder = { [ORDER_STATUS.PENDING]: 1, [ORDER_STATUS.ACCEPTED]: 2, [ORDER_STATUS.IN_TRANSIT]: 3, [ORDER_STATUS.DELIVERED]: 4 };
        return statusOrder[normalizeOrderStatus(a.status)] - statusOrder[normalizeOrderStatus(b.status)];
      });
      setOrders(sortedData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useOrdersFeedSubscription({
    volunteerUid: user?.id,
    onChange: (payload) => {
      if (payload.eventType === "DELETE") {
        setOrders((prev) => prev.filter((o) => o.order_id !== payload.old.order_id));
        return;
      }

      applyOrder(payload.new);
    },
  });

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
  }, [selectedOrder]);

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
    const normalizedStatus = normalizeOrderStatus(item.status);
    const isAccepted = normalizedStatus === ORDER_STATUS.ACCEPTED;
    const isInTransit = normalizedStatus === ORDER_STATUS.IN_TRANSIT;
    const isUrgent = normalizedStatus === ORDER_STATUS.PENDING && item.created_at && (new Date() - new Date(item.created_at)) > 2 * 60 * 60 * 1000;
    const isDelivered = normalizedStatus === ORDER_STATUS.DELIVERED;
    const backgroundColor = isAccepted ? "#FD9A3A" : isInTransit ? "#7A5AF8" : isUrgent ? "#ff572d" : isDelivered ? "#90EE90" : "#FEF3C7";

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
          {isUrgent ? "Status: Urgent" : `Status: ${normalizedStatus}`}
        </Text>
        {!isDelivered && (
          <AppButton
            title={isAccepted || isInTransit ? "View Details" : "Accept"}
            variant={isAccepted || isInTransit ? "secondary" : "primary"}
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
      {loading ? (
        <Text>Loading…</Text>
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
                  Status: {normalizeOrderStatus(selectedOrder.status)}
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
                  .update({ status: ORDER_STATUS.ACCEPTED, volunteer_uid: user.id })
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