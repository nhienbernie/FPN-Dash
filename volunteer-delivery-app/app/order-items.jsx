import { router } from "expo-router";
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
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const ITEMS = [
  { key: "item_milk", label: "Milk" },
  { key: "item_pb", label: "Peanut Butter" },
  { key: "item_mac_cheese", label: "Mac & Cheese" },
];

export default function OrderItems() {
  const [selected, setSelected] = useState({
    item_milk: false,
    item_pb: false,
    item_mac_cheese: false,
  });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleItem = (key) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
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

      const { error: insertError } = await supabase.from("orders").insert({
        customer_uid: customer.uid,
        name: customer.first_name,
        delivery_address: customer.address,
        status: "pending",
        notes: notes.trim() || null,
        ...selected,
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        if (insertError.code === "23505") {
          Alert.alert("Error", "You already have an active order.");
        } else {
          Alert.alert("Error", `Failed to place order: ${insertError.message || insertError.code || "Unknown error"}`);
        }
        return;
      }

      router.replace("/order-status");
    } catch (_) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Select Items</Text>
      <Text style={styles.subtitle}>Choose what you'd like in your order</Text>

      <View style={styles.section}>
        {ITEMS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={styles.checkboxRow}
            onPress={() => toggleItem(key)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, selected[key] && styles.checkboxChecked]}>
              {selected[key] && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55
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
    marginTop: 50
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 28,
  },
  section: {
    marginBottom: 28,
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
