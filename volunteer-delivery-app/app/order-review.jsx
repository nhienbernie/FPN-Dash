import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { buildOrderNotes } from "../lib/orderSelectionWorkaround";
import { ORDER_STATUS } from "../lib/orderStatus";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

export default function OrderReview() {
  const params = useLocalSearchParams();
  const boxCount = parseInt(params.boxCount) || 1;
  const allSelections = useMemo(
    () => (params.allSelections ? JSON.parse(params.allSelections) : []),
    [params.allSelections],
  );

  const [notes, setNotes] = useState("");
  const [itemLabels, setItemLabels] = useState({});
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const fetchLabels = async () => {
      const allIds = [...new Set(allSelections.flat())];
      if (allIds.length === 0) {
        setInitializing(false);
        return;
      }

      const { data } = await supabase
        .from("items")
        .select("id, label")
        .in("id", allIds);

      if (data) {
        const map = {};
        for (const item of data) {
          map[item.id] = item.label;
        }
        setItemLabels(map);
      }
      setInitializing(false);
    };

    fetchLabels();
  }, [allSelections]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "User not authenticated.");
        return;
      }

      const { data: customer, error: fetchError } = await supabase
        .from("customers")
        .select("uid, first_name, address")
        .eq("uid", user.id)
        .single();

      if (fetchError || !customer) {
        Alert.alert("Error", "Failed to fetch user data.");
        return;
      }

      const selectedLabels = [...new Set(allSelections.flat())].map(
        (itemId) => itemLabels[itemId] ?? String(itemId)
      );

      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_uid: customer.uid,
          name: customer.first_name,
          delivery_address: customer.address,
          status: ORDER_STATUS.PENDING,
          notes: buildOrderNotes({
            selectedItems: selectedLabels,
            userNotes: notes,
          }),
          box_count: boxCount,
        })
        .select("order_id")
        .single();

      if (orderError) {
        if (orderError.code === "23505") {
          Alert.alert("Error", "You already have an active order.");
        } else {
          Alert.alert("Error", `Failed to place order: ${orderError.message}`);
        }
        return;
      }

      for (let i = 0; i < boxCount; i++) {
        const { data: newBox, error: boxError } = await supabase
          .from("boxes")
          .insert({ order_id: newOrder.order_id, box_number: i + 1 })
          .select("box_id")
          .single();

        if (boxError) {
          Alert.alert("Error", "Failed to save boxes.");
          return;
        }

        const selectedForBox = allSelections[i] ?? [];
        if (selectedForBox.length > 0) {
          const rows = selectedForBox.map((item_id) => ({
            box_id: newBox.box_id,
            item_id,
          }));
          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(rows);
          if (itemsError) {
            Alert.alert("Error", "Failed to save items.");
            return;
          }
        }
      }

      router.replace("/order-status");
    } catch (_) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.mutedText }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Review Order</Text>
        <Text style={styles.subtitle}>Confirm what&apos;s in each box</Text>

        {Array.from({ length: boxCount }, (_, i) => {
          const boxItems = allSelections[i] ?? [];
          return (
            <View key={i} style={styles.boxCard}>
              <Text style={styles.boxTitle}>Box {i + 1}</Text>
              {boxItems.length === 0 ? (
                <Text style={styles.emptyBox}>No items selected</Text>
              ) : (
                boxItems.map((id) => (
                  <Text key={id} style={styles.itemRow}>
                    • {itemLabels[id] ?? id}
                  </Text>
                ))
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Special Instructions</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Any allergies, notes, or requests..."
          placeholderTextColor={theme.colors.mutedText}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <AppButton
          title="Confirm Order"
          onPress={handleConfirm}
          disabled={loading}
          style={styles.button}
        />
        {loading && <Text style={styles.loadingText}>Placing order...</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  outerContainer: {
    flex: 1,
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 50,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 28,
  },
  boxCard: {
    borderWidth: 1,
    borderColor: theme.colors.mutedText + "44",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyBox: {
    fontSize: 15,
    color: theme.colors.mutedText,
    fontStyle: "italic",
  },
  itemRow: {
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.mutedText + "66",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    minHeight: 100,
    marginBottom: 28,
  },
  button: {
    width: "100%",
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.primary,
    textAlign: "center",
    marginTop: 16,
  },
});
