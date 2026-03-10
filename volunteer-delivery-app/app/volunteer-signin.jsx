import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import {
  buildInitialValues,
  validateFieldSet,
} from "../validators/volunteerValidators";
import { styles } from "../styles/volunteerSignUpSignIn.styles";
import { supabase } from "../lib/supabase";

const FIELDS = [
  {
    key: "identifier",
    label: "Email or Username",
    placeholder: "Enter your email or username",
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

const INITIAL_VALUES = buildInitialValues(FIELDS);

export default function SignInScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState("idle");

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

    // Determine if identifier is an email or username
    const isEmail = identifier.includes("@");
    let email = identifier;

    if (!isEmail) {
      // Look up email by username in volunteers table
      const { data, error } = await supabase
        .from("volunteers")
        .select("email")
        .eq("username", identifier)
        .single();

      if (error || !data) {
        setErrors({ general: "No account found with that username." });
        setSubmitState("idle");
        return;
      }

      email = data.email;
    }

    // Sign in via Supabase auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setErrors({ general: "Invalid credentials. Please try again." });
      setSubmitState("idle");
      return;
    }

    console.log("Signed in successfully:", authData.user);
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}