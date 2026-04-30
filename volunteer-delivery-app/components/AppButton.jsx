import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../theme";

const VARIANTS = {
  primary: {
    background: theme.colors.primary,
    pressed: theme.colors.primaryPressed,
    text: theme.colors.primaryText,
    border: theme.colors.primary,
  },
  secondary: {
    background: theme.colors.secondary,
    pressed: theme.colors.secondaryPressed,
    text: theme.colors.secondaryText,
    border: theme.colors.secondaryPressed,
  },
  ghost: {
    background: theme.colors.surface,
    pressed: theme.colors.surfaceMuted,
    text: theme.colors.text,
    border: theme.colors.border,
  },
  danger: {
    background: theme.colors.danger,
    pressed: "#B91C1C",
    text: theme.colors.primaryText,
    border: theme.colors.danger,
  },
};

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  style,
  textStyle,
  disabled = false,
  testID,
}) {
  const colors = VARIANTS[variant] || VARIANTS.primary;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.pressed : colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.text }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 2,
  },
  text: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
