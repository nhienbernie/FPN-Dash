import { useState } from "react";
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

const CATEGORIES = [
  {
    label: "Protein",
    items: [
      { key: "item_meat", label: "Meat" },
      { key: "item_plant_protein", label: "Plant" },
    ],
  },
  {
    label: "Drink",
    items: [
      { key: "item_milk", label: "Milk" },
      { key: "item_oj", label: "O.J." },
    ],
  },
  {
    label: "Diet Restrictions",
    subtitle: "Please put in description if not listed",
    items: [
      { key: "diet_kosher", label: "Kosher" },
      { key: "diet_vegan", label: "Vegan" },
      { key: "diet_vegetarian", label: "Vegetarian" },
      { key: "diet_pescatarian", label: "Pescatarian" },
      { key: "diet_gluten_free", label: "Gluten Free" },
    ],
  },
];

export default function OrderItems() {
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleItem = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
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
        const rows = selected.map((item_key) => ({
          order_id: newOrder.order_id,
          item_key,
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Select Items</Text>
      <Text style={styles.subtitle}>Choose what you'd like in your order</Text>

      {CATEGORIES.map(({ label, subtitle, items }) => (
        <View key={label} style={styles.categoryBlock}>
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryLabel}>{label}</Text>
            {subtitle && (
              <Text style={styles.categorySubtitle}>{subtitle}</Text>
            )}
          </View>
          {items.map(({ key, label: itemLabel }) => (
            <TouchableOpacity
              key={key}
              style={styles.checkboxRow}
              onPress={() => toggleItem(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, selected.includes(key) && styles.checkboxChecked]}>
                {selected.includes(key) && <Text style={styles.checkmark}>✓</Text>}
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