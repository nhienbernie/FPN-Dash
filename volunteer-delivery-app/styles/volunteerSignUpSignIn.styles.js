import { StyleSheet } from "react-native";
import { theme } from "../theme";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 3,
  },
  successBanner: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: theme.colors.errorBg,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 16,
  },
  successText: {
    color: theme.colors.successText,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
    marginTop: theme.spacing.xl,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.mutedText,
    marginBottom: 8,
  },
  stepHint: {
    fontSize: 15,
    color: theme.colors.mutedText,
    marginBottom: 22,
    lineHeight: 22,
  },
  fieldWrapper: {
    marginBottom: 16,
  },
  label: {
    color: theme.colors.labelText,
    fontSize: 14,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputError: {
    borderColor: theme.colors.errorBorder,
  },
  errorText: {
    marginTop: 6,
    color: theme.colors.errorText,
    fontSize: 13,
  },
  submitButton: {
    marginTop: 12,
  },
  stepTwoActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  backButton: {
    marginRight: 0,
  },
});
