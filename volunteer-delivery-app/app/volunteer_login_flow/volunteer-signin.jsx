import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../../components/AppButton";
import {
  buildInitialValues,
  validateFieldSet,
} from "../../validators/volunteerValidators";
import { styles } from "../../styles/volunteerSignUpSignIn.styles";

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

    if (submitState === "success") {
      setSubmitState("idle");
    }
  };

  const handleSubmit = () => {
    const nextErrors = validateFieldSet({
      fields: FIELDS,
      values: formValues,
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitState("idle");
      return;
    }

    setErrors({});
    setSubmitState("success");
    // TODO: replace with real auth logic
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
              Sign-in details look good. Continuing to your account...
            </Text>
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
          title="Sign In"
          onPress={handleSubmit}
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
