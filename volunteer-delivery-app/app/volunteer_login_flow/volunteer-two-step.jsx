import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AppButton from "../../components/AppButton";
import { styles } from "../../styles/volunteerSignUpSignIn.styles";

export default function TwoStepScreen() {
  const router = useRouter();
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <AppButton
          title="New Volunteer"
          onPress={() => router.push("volunteer_login_flow/volunteer-signup")}
          style={styles.submitButton}
        />
        <AppButton
          title="Returning Volunteer"
          variant="secondary"
          onPress={() => router.push("volunteer_login_flow/volunteer-signin")}
          style={styles.submitButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
