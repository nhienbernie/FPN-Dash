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
    keyboardType: "default",
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
  const [errors, setErrors] = useState({});
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleNext = () => {
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
      return;
    }

    // TODO: navigate to next requester step
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
              The information you provide is used solely to verify your
              eligibility for food assistance. All data is kept confidential
              and will not be shared with third parties.
            </Text>
            <AppButton
              title="I Understand"
              onPress={() => setDisclaimerVisible(false)}
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
          <Text style={styles.title}>Request Food Assistance</Text>
          <Text style={styles.stepHint}>Enter your details to continue.</Text>

          {FIELDS.map((field) => (
            <View key={field.key} style={styles.fieldWrapper}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                value={formValues[field.key]}
                onChangeText={(text) => handleChange(field.key, text)}
                placeholder={field.placeholder}
                keyboardType={field.keyboardType}
                autoCapitalize="none"
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
            title="Next"
            onPress={handleNext}
            style={styles.submitButton}
          />
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
});
