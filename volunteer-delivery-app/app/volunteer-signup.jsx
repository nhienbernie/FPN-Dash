import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { theme } from "../theme";

const digitsOnly = (value = "") => value.replace(/\D/g, "");
const isValidEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isValidZip = (value = "") => /^\d{5}$/.test(value.trim());

const FIELDS = [
  {
    key: "firstName",
    label: "First Name",
    placeholder: "Enter first name",
    required: true,
    autoCapitalize: "words",
  },
  {
    key: "lastName",
    label: "Last Name",
    placeholder: "Enter last name",
    required: true,
    autoCapitalize: "words",
  },
  {
    key: "phone",
    label: "Phone Number",
    placeholder: "Enter 10-digit phone number",
    required: true,
    keyboardType: "phone-pad",
    validate: (value) =>
      digitsOnly(value).length === 10
        ? null
        : "Phone number must be 10 digits.",
  },
  {
    key: "email",
    label: "Email",
    placeholder: "Enter email address",
    required: true,
    keyboardType: "email-address",
    autoCapitalize: "none",
    validate: (value) =>
      isValidEmail(value) ? null : "Enter a valid email address.",
  },
  {
    key: "zip",
    label: "ZIP Code",
    placeholder: "Enter ZIP code",
    required: true,
    keyboardType: "number-pad",
    validate: (value) =>
      isValidZip(value) ? null : "ZIP code must be 5 digits.",
  },
  {
    key: "username",
    label: "Username",
    placeholder: "Create a username",
    required: true,
    autoCapitalize: "none",
  },
  {
    key: "password",
    label: "Password",
    placeholder: "Create a password",
    required: true,
    autoCapitalize: "none",
    secureTextEntry: true,
    validate: (value) =>
      value.length >= 8 ? null : "Password must be at least 8 characters.",
  },
  {
    key: "confirmPassword",
    label: "Confirm Password",
    placeholder: "Re-enter your password",
    required: true,
    autoCapitalize: "none",
    secureTextEntry: true,
    validate: (value, values) =>
      value === values.password ? null : "Passwords do not match.",
  },
];

const INITIAL_VALUES = Object.fromEntries(
  FIELDS.map((field) => [field.key, ""]),
);

const validateForm = (values) => {
  const nextErrors = {};

  FIELDS.forEach((field) => {
    const value = String(values[field.key] ?? "");
    const trimmedValue = value.trim();

    if (field.required && !trimmedValue) {
      nextErrors[field.key] = `${field.label} is required.`;
      return;
    }

    if (trimmedValue && field.validate) {
      const validationError = field.validate(value, values);
      if (validationError) {
        nextErrors[field.key] = validationError;
      }
    }
  });

  return nextErrors;
};

export default function VolunteerSignupScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState("idle");

  const handleChange = (field, value) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));

    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const next = { ...prev };
      delete next[field];
      return next;
    });

    if (submitState === "success") {
      setSubmitState("idle");
    }
  };

  const handleSubmit = () => {
    const nextErrors = validateForm(formValues);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitState("idle");
      return;
    }

    setErrors({});
    setSubmitState("success");
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {submitState === "success" ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>
              Volunteer sign-up details look good. You can continue to next
              onboarding steps.
            </Text>
          </View>
        ) : null}

        <Text style={styles.title}>Volunteer Sign Up</Text>
        <Text style={styles.subtitle}>
          Enter your information to register as a volunteer.
        </Text>

        {FIELDS.map((field) => (
          <View key={field.key} style={styles.fieldWrapper}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={formValues[field.key]}
              onChangeText={(text) => handleChange(field.key, text)}
              placeholder={field.placeholder}
              keyboardType={field.keyboardType}
              autoCapitalize={field.autoCapitalize || "sentences"}
              secureTextEntry={field.secureTextEntry}
              style={[
                styles.input,
                errors[field.key] ? styles.inputError : null,
              ]}
            />
            {errors[field.key] ? (
              <Text style={styles.errorText}>{errors[field.key]}</Text>
            ) : null}
          </View>
        ))}

        <AppButton
          title="Create Volunteer Account"
          onPress={handleSubmit}
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
});
