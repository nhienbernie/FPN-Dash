import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

export default function OrderBoxes() {
  const [boxCount, setBoxCount] = useState(1);

  const decrement = () => {
    if (boxCount > 1) setBoxCount((prev) => prev - 1);
  };

  const increment = () => {
    setBoxCount((prev) => prev + 1);
  };

  const handleContinue = () => {
    router.replace({
      pathname: "/order-items",
      params: { boxCount, currentBox: 1 },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How many boxes?</Text>
      <Text style={styles.subtitle}>
        Each box can be customized with different items.
      </Text>

      <View style={styles.stepper}>
        <TouchableOpacity
          testID="order-boxes-decrement"
          style={[styles.stepButton, boxCount === 1 && styles.stepButtonDisabled]}
          onPress={decrement}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>−</Text>
        </TouchableOpacity>

        <Text style={styles.count}>{boxCount}</Text>

        <TouchableOpacity
          testID="order-boxes-increment"
          style={styles.stepButton}
          onPress={increment}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <AppButton
        title="Continue"
        onPress={handleContinue}
        style={styles.button}
        testID="order-boxes-continue"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.mutedText,
    marginBottom: 40,
    textAlign: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
    gap: 32,
  },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  stepButtonDisabled: {
    borderColor: theme.colors.mutedText,
  },
  stepButtonText: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  count: {
    fontSize: 48,
    fontWeight: "700",
    color: theme.colors.text,
    minWidth: 60,
    textAlign: "center",
  },
  button: {
    width: "100%",
  },
});
