import { StyleSheet } from "react-native";
import { theme } from "../theme";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  successBanner: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: "#FEF3F2",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: theme.colors.successText,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.mutedText,
    marginBottom: 6,
  },
  stepHint: {
    fontSize: 15,
    color: theme.colors.mutedText,
    marginBottom: 22,
  },
  fieldWrapper: {
    marginBottom: 14,
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
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputError: {
    borderColor: theme.colors.danger,
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
  },
  actionButton: {
    flex: 1,
  },
  backButton: {
    marginRight: 10,
  },
});
