import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";

export default function Index() {
  useEffect(() => {
    router.replace("/mode-select");
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#252627" />
    </View>
  );
}
