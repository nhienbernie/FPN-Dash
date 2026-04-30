import { useRouter } from "expo-router";
import { supabase } from "../services/supabase";

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { styles } from "../styles/volunteerSignUpSignIn.styles";
import { theme } from "../theme";
import { digitsOnly } from "../validators/volunteerValidators";

const AUTH_API_BASE_URL =
  process.env.EXPO_PUBLIC_DEMO_API_URL ?? "http://localhost:4000";
const VERIFICATION_CODE_LENGTH = 6;
const DEMO_VERIFICATION_DEFAULT_CODE = "123456";

// To automatically format input as the user types their DOB
const DOB_DIGIT_LENGTH = 8;

const formatDobInput = (value = "") => {
  const digits = digitsOnly(value).slice(0, DOB_DIGIT_LENGTH);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const FIELDS = [
  {
    key: "phone",
    label: "Phone Number",
    placeholder: "Enter 10-digit phone number",
    required: true,
    keyboardType: "phone-pad",
    validate: (value) => {
      const digits = String(value).replace(/\D/g, "");
      return digits.length === 10 ? null : "Phone number must be 10 digits.";
    },
  },
  {
    key: "dob",
    label: "Date of Birth",
    placeholder: "MM/DD/YYYY",
    required: true,
    keyboardType: "number-pad",
    validate: (value) => {
      const trimmed = String(value).trim();
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        return "Enter a valid date (MM/DD/YYYY).";
      }
      return null;
    },
  },
];

const INITIAL_VALUES = { phone: "", dob: "" };

export default function RequesterScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [submitState, setSubmitState] = useState("idle");
  const [serverMessage, setServerMessage] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const router = useRouter();

  const resetVerificationState = () => {
    setVerificationRequested(false);
    setVerificationCode("");
    setServerMessage("");
    setNormalizedPhone("");
    setSubmitState("idle");
  };

  const clearGeneralErrors = () => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next.general;
      delete next.code;
      return next;
    });
  };

  const handleChange = (field, value) => {
    const nextValue = field === "dob" ? formatDobInput(value) : value;

    setFormValues((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      delete next.general;
      return next;
    });

    if (verificationRequested) {
      resetVerificationState();
    }
  };

  const validateBaseFields = () => {
    const nextErrors = {};

    FIELDS.forEach((field) => {
      const value = String(formValues[field.key] ?? "");
      const trimmed = value.trim();

      if (field.required && !trimmed) {
        nextErrors[field.key] = `${field.label} is required.`;
        return;
      }

      if (trimmed && typeof field.validate === "function") {
        const err = field.validate(value, formValues);
        if (err) nextErrors[field.key] = err;
      }
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    return {
      phone: digitsOnly(formValues.phone),
      dob: formValues.dob.trim(),
    };
  };

  const sendAuthRequest = async (path, payload) => {
    const response = await fetch(`${AUTH_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.message || "Request failed.");
    }

    return body;
  };

  const installVerifiedSession = async (session) => {
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Verified session was not returned by the server.");
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (sessionError) {
      throw new Error(sessionError.message);
    }
  };

  const finishVerifiedSignIn = async ({
    phone,
    dob,
    code,
    successMessage,
  }) => {
    const response = await sendAuthRequest("/api/food-signup/verify", {
      phone,
      dob,
      code,
    });

    await installVerifiedSession(response.session);

    setErrors({});
    setVerificationRequested(false);
    setVerificationCode("");
    setServerMessage(successMessage || response.message || "");
    setSubmitState("idle");
    router.replace("/order-food");
  };

  const handleSendCode = async () => {
    const validatedValues = validateBaseFields();

    if (!validatedValues) return;

    setSubmitState("sending");
    setServerMessage("");
    setErrors({});

    try {
      const response = await sendAuthRequest("/api/food-signup/start", {
        phone: validatedValues.phone,
        dob: validatedValues.dob,
      });

      if (response.status === "demo_verification_ready") {
        setSubmitState("verifying");
        await finishVerifiedSignIn({
          phone: response.normalizedPhone || validatedValues.phone,
          dob: validatedValues.dob,
          code: response.demoCode || DEMO_VERIFICATION_DEFAULT_CODE,
          successMessage: response.message,
        });
        return;
      }

      setNormalizedPhone(response.normalizedPhone || validatedValues.phone);
      setVerificationRequested(true);
      setVerificationCode("");
      setServerMessage(response.message || "Verification code sent.");
      setSubmitState("idle");
    } catch (error) {
      setErrors({
        general: error.message || "Unable to send verification code.",
      });
      setSubmitState("idle");
    }
  };

  const handleVerifyAndContinue = async () => {
    const validatedValues = validateBaseFields();
    const trimmedCode = verificationCode.trim();

    if (!validatedValues) return;

    if (trimmedCode.length !== VERIFICATION_CODE_LENGTH) {
      setErrors({ code: "Verification code must be 6 digits." });
      return;
    }

    setSubmitState("verifying");
    setServerMessage("");
    setErrors({});

    try {
      await finishVerifiedSignIn({
        phone: normalizedPhone || validatedValues.phone,
        dob: validatedValues.dob,
        code: trimmedCode,
      });
    } catch (error) {
      setErrors({ general: error.message || "Unable to verify your account." });
      setSubmitState("idle");
    }
  };

  return (
    <>
      <Modal
        visible={disclaimerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDisclaimerVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>Disclaimer</Text>
            <Text style={modalStyles.body}>
              To ensure we can deliver food to those in need, we ask that{" "}
              <Text style={{ fontWeight: "700" }}>you only use this service</Text>
              {" "}if{" "}
              <Text style={{ fontWeight: "700" }}>both</Text>
              {" "}of the following statements are true:{"\n"}
              {"\n"}• I am unable to travel to any of the FPN pantries in person{"\n"}
              • I have no family, friends or neighbors who can pick up food for me{"\n"}
              {"\n"}If either of these do not apply to you, we ask that you travel or send someone else to pick up your food in person, so that this service is available to those with no such options.
            </Text>
            <AppButton
              title="I Understand"
              onPress={() => setDisclaimerVisible(false)}
              testID="requester-disclaimer-accept"
            />
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
            {serverMessage ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>{serverMessage}</Text>
              </View>
            ) : null}

            {errors.general ? (
              <View style={modalStyles.errorBanner}>
                <Text style={styles.errorText}>{errors.general}</Text>
              </View>
            ) : null}

            <Text style={styles.title}>Request Food Assistance</Text>
            <Text style={styles.stepHint}>
              {verificationRequested
                ? "Enter the 6-digit code to finish signing in."
                : "Enter your phone number and date of birth to receive a login code by text, or use the demo requester for instant access."}
            </Text>

            {FIELDS.map((field) => (
              <View key={field.key} style={styles.fieldWrapper}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  testID={`requester-${field.key}`}
                  value={formValues[field.key]}
                  onChangeText={(text) => handleChange(field.key, text)}
                  placeholder={field.placeholder}
                  placeholderTextColor={theme.colors.mutedText}
                  keyboardType={field.keyboardType}
                  maxLength={field.key === "dob" ? 10 : undefined}
                  autoCapitalize="none"
                  editable={submitState === "idle"}
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

            {verificationRequested ? (
              <>
                <View style={styles.fieldWrapper}>
                  <Text style={styles.label}>Verification Code</Text>
                  <TextInput
                    testID="requester-verification-code"
                    value={verificationCode}
                    onChangeText={(text) => {
                      setVerificationCode(
                        digitsOnly(text).slice(0, VERIFICATION_CODE_LENGTH),
                      );
                      clearGeneralErrors();
                    }}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={theme.colors.mutedText}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    editable={submitState === "idle"}
                    style={[
                      styles.input,
                      errors.code ? styles.inputError : null,
                    ]}
                  />
                  {errors.code ? (
                    <Text style={styles.errorText}>{errors.code}</Text>
                  ) : null}
                </View>

                <View style={styles.stepTwoActions}>
                  <AppButton
                    title={
                      submitState === "sending" ? "Sending..." : "Send Again"
                    }
                    variant="secondary"
                    onPress={handleSendCode}
                    disabled={submitState !== "idle"}
                    style={[styles.actionButton, styles.backButton]}
                    testID="requester-send-again"
                  />
                  <AppButton
                    title={
                      submitState === "verifying" ? "Verifying..." : "Verify"
                    }
                    onPress={handleVerifyAndContinue}
                    disabled={submitState !== "idle"}
                    style={styles.actionButton}
                    testID="requester-verify"
                  />
                </View>
              </>
            ) : (
              <AppButton
                title={submitState === "sending" ? "Sending..." : "Send Code"}
                onPress={handleSendCode}
                disabled={submitState !== "idle"}
                style={styles.submitButton}
                testID="requester-send-code"
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: 24,
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: theme.colors.mutedText,
    lineHeight: 22,
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: theme.colors.errorBg,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
});
