import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const CATEGORY_SUBTITLES = {
  "Diet Restrictions": "Please put in description if not listed",
};

export default function OrderItems() {
  const params = useLocalSearchParams();
  const boxCount = parseInt(params.boxCount) || 1;
  const currentBox = parseInt(params.currentBox) || 1;
  const prevSelections = params.prevSelections
    ? JSON.parse(params.prevSelections)
    : [];

  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
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

  const handleContinue = () => {
    const allSelections = [...prevSelections, selected];

    if (currentBox < boxCount) {
      router.push({
        pathname: "/order-items",
        params: {
          boxCount,
          currentBox: currentBox + 1,
          prevSelections: JSON.stringify(allSelections),
        },
      });
    } else {
      router.push({
        pathname: "/order-review",
        params: {
          boxCount,
          allSelections: JSON.stringify(allSelections),
        },
      });
    }
  };

  if (initializing) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.mutedText }}>Loading...</Text>
      </View>
    );
  }

  const isLastBox = currentBox === boxCount;

  return (
    <View style={styles.outerContainer}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.boxIndicator}>
          Box {currentBox} of {boxCount}
        </Text>
        <Text style={styles.title}>Select Items</Text>
        <Text style={styles.subtitle}>Choose what you'd like in this box</Text>

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
                <View
                  style={[
                    styles.checkbox,
                    selected.includes(id) && styles.checkboxChecked,
                  ]}
                >
                  {selected.includes(id) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <Text style={styles.checkboxLabel}>{itemLabel}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <AppButton
          title={isLastBox ? "Review Order" : "Next Box"}
          onPress={handleContinue}
          style={styles.button}
        />
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
  boxIndicator: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 50,
    marginBottom: 4,
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
  button: {
    width: "100%",
    marginTop: 8,
  },
});
