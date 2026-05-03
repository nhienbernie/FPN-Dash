import { forwardRef, useImperativeHandle, useRef } from "react";
import MapView, { Marker } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

// Purple pin for pantry locations — distinct from gold (available orders)
// and teal (active delivery).
const PANTRY_PIN_COLOR = "#7C3AED";

function computeRegion(volunteerCoords, orderCoordsList) {
  const allPoints = [
    ...(volunteerCoords ? [volunteerCoords] : []),
    ...orderCoordsList,
  ];

  if (allPoints.length === 0) {
    return {
      latitude: 40.0583,
      longitude: -82.4013,
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

  const latDelta = Math.max((maxLat - minLat) * 1.5, 0.04);
  const lonDelta = Math.max((maxLon - minLon) * 1.5, 0.04);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

const EDGE_PADDING = { top: 80, right: 60, bottom: 80, left: 60 };

const VolunteerMapView = forwardRef(function VolunteerMapView(
  {
    volunteerCoords,
    availableOrders,
    orderCoords,
    activeOrder,
    activeOrderCoords,
    pantryLocations = [],
    onOrderPress,
  },
  ref,
) {
  const mapViewRef = useRef(null);

  // Exposed imperative API — parent calls fitToAll(coordsArray) after new
  // orders arrive so the viewport smoothly animates to include all markers.
  useImperativeHandle(
    ref,
    () => ({
      fitToAll(coords) {
        if (!mapViewRef.current || !coords?.length) return;
        mapViewRef.current.fitToCoordinates(coords, {
          edgePadding: EDGE_PADDING,
          animated: true,
        });
      },
    }),
    [],
  );

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
      <MapView
        ref={mapViewRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
      >
        {/* Pantry location pins — small dots so they don't compete visually
            with the full-height order pins. Rendered first so order pins
            sit on top when they overlap. */}
        {pantryLocations.map((pantry) => {
          if (!pantry.coords?.latitude) return null;
          const description = pantry.seasonal
            ? `${pantry.hours} · ${pantry.seasonal}`
            : pantry.hours;
          return (
            <Marker
              key={pantry.id}
              coordinate={pantry.coords}
              title={pantry.name}
              description={description}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.pantryDot} />
            </Marker>
          );
        })}

        {/* Available order pins */}
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

        {/* Active delivery pin */}
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
          <View style={[styles.legendDot, { backgroundColor: PANTRY_PIN_COLOR }]} />
          <Text style={styles.legendText}>Pantry locations</Text>
        </View>
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
});

export default VolunteerMapView;

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
  pantryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: PANTRY_PIN_COLOR,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
