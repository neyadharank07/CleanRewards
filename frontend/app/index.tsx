import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";

export default function Index() {
  const { user, loading } = useAuth();
  const t = useTheme();

  useEffect(() => {}, [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={t.brand} />
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}
