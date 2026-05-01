import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { useLiveMenuItems } from "../lib/menuRealtime";
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

  const [selected, setSelected] = useState([]);
  const [menuNotice, setMenuNotice] = useState("");
  const { categories, activeItemIds, initializing, errorMessage } = useLiveMenuItems();

  useEffect(() => {
    const availableIds = new Set(activeItemIds);

    setSelected((current) => {
      const next = current.filter((itemId) => availableIds.has(itemId));

      if (next.length !== current.length) {
        setMenuNotice("The menu changed, so unavailable selections were removed.");
      }

      return next;
    });
  }, [activeItemIds]);

  const toggleItem = (id) => {
    if (menuNotice) {
      setMenuNotice("");
    }

    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    const allSelections = [...prevSelections, selected];

    if (currentBox < boxCount) {
      router.replace({
        pathname: "/order-items",
        params: {
          boxCount,
          currentBox: currentBox + 1,
          prevSelections: JSON.stringify(allSelections),
        },
      });
    } else {
      router.replace({
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
        <Text style={styles.subtitle}>Choose what you&apos;d like in this box</Text>
        {errorMessage ? <Text style={styles.menuStatusText}>{errorMessage}</Text> : null}
        {menuNotice ? <Text style={styles.menuStatusText}>{menuNotice}</Text> : null}

        {categories.length === 0 ? (
          <Text style={styles.emptyStateText}>
            No menu items are available right now. Please check back soon.
          </Text>
        ) : null}

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
                testID={`order-items-box-${currentBox}-item-${id}`}
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
          testID="order-items-continue"
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
  menuStatusText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginBottom: 16,
    lineHeight: 20,
  },
  emptyStateText: {
    fontSize: 15,
    color: theme.colors.mutedText,
    lineHeight: 22,
    marginBottom: 24,
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
