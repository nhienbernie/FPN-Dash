import MapView, { Marker } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

function computeRegion(volunteerCoords, orderCoordsList) {
  const allPoints = [
    ...(volunteerCoords ? [volunteerCoords] : []),
    ...orderCoordsList,
  ];

  if (allPoints.length === 0) {
    return {
      latitude: 39.2904,
      longitude: -76.6122,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }

  const lats = allPoints.map((p) => p.latitude);
  const lons = allPoints.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.04);
  const lonDelta = Math.max((maxLon - minLon) * 1.4, 0.04);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

export default function VolunteerMapView({
  volunteerCoords,
  availableOrders,
  orderCoords,
  activeOrder,
  activeOrderCoords,
  onOrderPress,
}) {
  const coordsList = Object.values(orderCoords).filter(
    (c) => c?.latitude && c?.longitude,
  );
  const allCoords = [
    ...coordsList,
    ...(activeOrderCoords ? [activeOrderCoords] : []),
  ];
  const region = computeRegion(volunteerCoords, allCoords);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region} showsUserLocation>
        {availableOrders.map((order) => {
          const coords = orderCoords[order.order_id];
          if (!coords?.latitude) return null;
          return (
            <Marker
              key={order.order_id}
              coordinate={coords}
              title={order.name}
              description={order.delivery_address}
              pinColor={theme.colors.secondary}
              onCalloutPress={() => onOrderPress?.(order)}
            />
          );
        })}
        {activeOrder && activeOrderCoords?.latitude ? (
          <Marker
            coordinate={activeOrderCoords}
            title={`Active: ${activeOrder.name}`}
            description={activeOrder.delivery_address}
            pinColor={theme.colors.primary}
          />
        ) : null}
      </MapView>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.secondary }]} />
          <Text style={styles.legendText}>Available orders</Text>
        </View>
        {activeOrder ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.legendText}>Your delivery</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 340,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  map: {
    flex: 1,
  },
  legend: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
  },
});
