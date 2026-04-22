import { useState } from "react";
import { useRouter } from "expo-router";

import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { ensureVolunteerProfile } from "../lib/volunteerProfile";
import { supabase } from "../services/supabase";
import { styles } from "../styles/volunteerSignUpSignIn.styles";
import {
  buildInitialValues,
  isValidEmail,
  validateFieldSet,
} from "../validators/volunteerValidators";

const FIELDS = [
  {
    key: "identifier",
    label: "Email or Username",
    placeholder: "Enter your email or username",
    required: true,
    autoCapitalize: "none",
    keyboardType: "email-address",
    validate: (value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return "Enter your email or username.";
      if (trimmed.includes("@")) {
        return isValidEmail(trimmed) ? null : "Enter a valid email address.";
      }
      return null;
    },
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

const INITIAL_VALUES = buildInitialValues(FIELDS);

export default function SignInScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState("idle");
  const router = useRouter();

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (submitState === "success") setSubmitState("idle");
  };

  const handleSubmit = async () => {
    const nextErrors = validateFieldSet({ fields: FIELDS, values: formValues });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitState("idle");
      return;
    }

    setSubmitState("loading");

    const { identifier, password } = formValues;
    let email = identifier.trim();

    if (!email.includes("@")) {
      const { data, error } = await supabase
        .from("volunteers")
        .select("email")
        .eq("username", email)
        .single();

      if (error || !data?.email) {
        setErrors({ general: "No account found with that username." });
        setSubmitState("idle");
        return;
      }

      email = data.email;
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setErrors({ general: "Invalid credentials. Please try again." });
      setSubmitState("idle");
      return;
    }

    const volunteerProfileResult = await ensureVolunteerProfile({
      supabase,
      user: authData.user,
    });

    if (
      volunteerProfileResult.status === "error" ||
      volunteerProfileResult.status === "incomplete"
    ) {
      setErrors({
        general:
          volunteerProfileResult.message ||
          "Unable to restore your volunteer profile.",
      });
      setSubmitState("idle");
      return;
    }

    setErrors({});
    setSubmitState("success");
    router.replace("/volunteer-dashboard");
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
        <View style={styles.formCard}>
          {submitState === "success" ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>
                Signed in successfully! Welcome back.
              </Text>
            </View>
          ) : null}

          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your volunteer account.</Text>

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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
