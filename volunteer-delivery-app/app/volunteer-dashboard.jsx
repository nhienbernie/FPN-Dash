import { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import AppButton from "../components/AppButton";

export default function VolunteerDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const router = useRouter();

  // fetch specific columns from Supabase orders table
  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*"
      );
    if (error) {
      console.error("Error fetching orders:", error);
    } else {
      setOrders(data);
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
    // choose yellowish until accepted, then green
    const backgroundColor =
      item.status && item.status.toLowerCase() === "accepted"
        ? theme.colors.successBg
        : "#FEF3C7"; // light yellow

    return (
      <View style={[styles.orderItem, { backgroundColor }]}>        
        {/* display name, creation time, and status in a row evenly spaced */}
        <View style={styles.orderRow}>
          <Text style={styles.orderSubText}>{item.name}</Text>
          <Text style={styles.orderSubText}>
            {item.created_at
              ? new Date(item.created_at).toLocaleString()
              : ""}
          </Text>
          <Text style={styles.orderSubText}>{item.status}</Text>
        </View>
        <AppButton title="Accept" onPress={() => setSelectedOrder(item)} />
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
                  Status: {selectedOrder.status}
                </Text>
                <Text style={styles.detailText}>
                  Address: {selectedOrder.delivery_address}
                </Text>
              </>
            )}
            <AppButton
              title="Confirm order"
              onPress={() => {
                // close modal then navigate, passing order info as params
                handleClose();
                if (selectedOrder) {
                  // stringify the whole order so confirm screen can inspect any fields
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
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  orderItem: {
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    // backgroundColor is set dynamically based on status
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  // row container for name, time, status
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  orderText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: "600",
  },
  orderSubText: {
    fontSize: 14,
    color: theme.colors.mutedText,
    // marginBottom moved to orderRow for spacing
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
  },
  detailText: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
});
