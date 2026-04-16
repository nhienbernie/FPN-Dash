import { useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "../services/supabase";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import { styles } from "../styles/volunteerSignUpSignIn.styles";
import {
  buildInitialValues,
  digitsOnly,
  isValidEmail,
  isValidZip,
  validateFieldSet,
} from "../validators/volunteerValidators";

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

// For the two stage sign-up flow
const STEP_ONE_KEYS = ["firstName", "lastName", "phone", "email", "zip"];
const STEP_TWO_KEYS = ["password", "confirmPassword"];

const INITIAL_VALUES = buildInitialValues(FIELDS);

export default function VolunteerSignupScreen() {
  const [formValues, setFormValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState("idle");
  const [step, setStep] = useState(1);
  const router = useRouter();

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

  const handleNext = () => {
    const nextErrors = validateFieldSet({
      fields: FIELDS,
      values: formValues,
      keys: STEP_ONE_KEYS,
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitState("idle");
      return;
    }

    setErrors({});
    setSubmitState("idle");
    setStep(2);
  };

  const handleBack = () => {
    setErrors({});
    setSubmitState("idle");
    setStep(1);
  };

  const handleSubmit = async () => {
    const nextErrors = validateFieldSet({
      fields: FIELDS,
      values: formValues,
      keys: STEP_TWO_KEYS,
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitState("loading");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formValues.email,
        password: formValues.password,
        options: {
          data: {
            role: "volunteer",
            first_name: formValues.firstName,
            last_name: formValues.lastName,
            phone_number: formValues.phone,
            zip: formValues.zip,
          },
        },
      });

      if (authError) {
        setErrors({
          general:
            authError.message || "Unable to create your volunteer account.",
        });
        setSubmitState("idle");
        return;
      }

      if (!authData?.user?.id) {
        setErrors({
          general:
            "Account creation did not finish successfully. Please try again.",
        });
        setSubmitState("idle");
        return;
      }

      const { error: profileError } = await supabase.from("volunteers").insert({
        uid: authData.user.id,
        first_name: formValues.firstName,
        last_name: formValues.lastName,
        phone_number: formValues.phone,
        email: formValues.email,
        zip: formValues.zip,
      });

      if (profileError) {
        setErrors({
          general: profileError.message || "Unable to create volunteer profile.",
        });
        setSubmitState("idle");
        return;
      }

      setSubmitState("success");
      router.replace("/volunteer-dashboard");
    } catch (_error) {
      setErrors({ general: "Something went wrong. Please try again." });
      setSubmitState("idle");
    }
  };

  const visibleKeys = step === 1 ? STEP_ONE_KEYS : STEP_TWO_KEYS;
  const visibleFields = FIELDS.filter((field) =>
    visibleKeys.includes(field.key),
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {errors.general ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errors.general}</Text>
          </View>
        ) : null}

        {submitState === "success" ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>
              Volunteer sign-up details look good. You can continue to next
              onboarding steps.
            </Text>
          </View>
        ) : null}

        <Text style={styles.title}>Volunteer Sign Up</Text>
        <Text style={styles.subtitle}>Step {step} of 2</Text>
        <Text style={styles.stepHint}>
          {step === 1
            ? "Enter your details to continue."
            : "Create your password to finish setting up your volunteer account."}
        </Text>

        {visibleFields.map((field) => (
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

        {step === 1 ? (
          <AppButton
            title="Next"
            onPress={handleNext}
            style={styles.submitButton}
          />
        ) : (
          <View style={styles.stepTwoActions}>
            <AppButton
              title="Back"
              variant="secondary"
              onPress={handleBack}
              style={[styles.actionButton, styles.backButton]}
            />
            <AppButton
              title={
                submitState === "loading"
                  ? "Creating Account..."
                  : "Create Volunteer Account"
              }
              onPress={handleSubmit}
              disabled={submitState === "loading"}
              style={styles.actionButton}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
