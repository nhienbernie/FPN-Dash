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
import { router } from "expo-router";
import AppButton from "../components/AppButton";
import { theme } from "../theme";
import { supabase } from "../lib/supabase";

const FIELDS = [
  {
    key: "email",
    label: "Email",
    placeholder: "Enter your email address",
    required: true,
    autoCapitalize: "none",
    keyboardType: "email-address",
  },
  {
    key: "password",
    label: "Password",
    placeholder: "Enter your password",
    required: true,
    autoCapitalize: "none",
    secureTextEntry: true,
  },
];

const INITIAL_VALUES = { email: "", password: "" };

const validateFields = (values) => {
  const nextErrors = {};

  FIELDS.forEach((field) => {
    const value = String(values[field.key] ?? "").trim();
    if (field.required && !value) {
      nextErrors[field.key] = `${field.label} is required.`;
    }
  });

  return nextErrors;
};

export default function UserSignInScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState("idle"); // idle | loading

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));

    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async () => {
    const nextErrors = validateFields(formValues);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitState("loading");

    const { error } = await supabase.auth.signInWithPassword({
      email: formValues.email.trim(),
      password: formValues.password,
    });

    if (error) {
      setErrors({ password: error.message });
      setSubmitState("idle");
    } else {
      setSubmitState("idle");
      router.replace("/mode-select");
    }
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
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your account.</Text>

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
          title={submitState === "loading" ? "Signing in..." : "Sign In"}
          onPress={handleSubmit}
          disabled={submitState === "loading"}
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
