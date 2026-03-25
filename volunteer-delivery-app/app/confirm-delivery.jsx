import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../theme";

export default function ConfirmDelivery() {
  const router = useRouter();
  const { name = "", address = "", order } = useLocalSearchParams();

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

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;

  const openMaps = () => {
    Linking.openURL(mapsUrl).catch((err) => console.error("Failed to open maps", err));
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
        <TouchableOpacity
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push("/volunteer-dashboard")}
        >
          <Text style={styles.backText}>Back to dashboard</Text>
        </TouchableOpacity>
      </View>
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
  backText: {
    fontSize: 16,
    color: theme.colors.secondary,
    textAlign: "center",
  },
});
