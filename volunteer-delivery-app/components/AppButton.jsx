import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../theme";

const VARIANTS = {
  primary: {
    background: theme.colors.primary,
    pressed: theme.colors.primaryPressed,
    text: theme.colors.primaryText,
  },
  secondary: {
    background: "#CE7E2D",
    pressed: "#D0D5DD",
    text: theme.colors.text,
  },
};

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  style,
  textStyle,
  disabled = false,
}) {
  const colors = VARIANTS[variant] || VARIANTS.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.pressed : colors.background,
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
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
