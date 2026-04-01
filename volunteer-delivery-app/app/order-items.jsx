import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const CATEGORY_SUBTITLES = {
  "Diet Restrictions": "Please put in description if not listed",
};

export default function OrderItems() {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, key, label, category")
        .eq("active", true)
        .order("category");

      if (error || !data) {
        Alert.alert("Error", "Failed to load items.");
        setInitializing(false);
        return;
      }

      const grouped = {};
      for (const item of data) {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push(item);
      }

      setCategories(
        Object.entries(grouped).map(([label, items]) => ({ label, items }))
      );
      setInitializing(false);
    };

    fetchItems();
  }, []);

  const toggleItem = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handlePlaceOrder = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
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

      const { data: newOrder, error: insertError } = await supabase
        .from("orders")
        .insert({
          customer_uid: customer.uid,
          name: customer.first_name,
          delivery_address: customer.address,
          status: "pending",
          notes: notes.trim() || null,
        })
        .select("order_id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          Alert.alert("Error", "You already have an active order.");
        } else {
          Alert.alert("Error", "Failed to place order.");
        }
        return;
      }

      if (selected.length > 0) {
        const rows = selected.map((item_id) => ({
          order_id: newOrder.order_id,
          item_id,
        }));
        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(rows);
        if (itemsError) {
          Alert.alert("Error", "Failed to save selected items.");
          return;
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Select Items</Text>
      <Text style={styles.subtitle}>Choose what you'd like in your order</Text>

      {categories.map(({ label, items }) => (
        <View key={label} style={styles.categoryBlock}>
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryLabel}>{label}</Text>
            {CATEGORY_SUBTITLES[label] && (
              <Text style={styles.categorySubtitle}>
                {CATEGORY_SUBTITLES[label]}
              </Text>
            )}
          </View>
          {items.map(({ id, label: itemLabel }) => (
            <TouchableOpacity
              key={id}
              style={styles.checkboxRow}
              onPress={() => toggleItem(id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, selected.includes(id) && styles.checkboxChecked]}>
                {selected.includes(id) && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>{itemLabel}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

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
        title="Place Order"
        onPress={handlePlaceOrder}
        disabled={loading}
        style={styles.button}
      />
      {loading && <Text style={styles.loadingText}>Placing order...</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
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
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 28,
  },
  categoryBlock: {
    marginBottom: 28,
  },
  categoryHeader: {
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  categorySubtitle: {
    fontSize: 13,
    color: theme.colors.mutedText,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mutedText + "33",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  checkboxLabel: {
    fontSize: 16,
    color: theme.colors.text,
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