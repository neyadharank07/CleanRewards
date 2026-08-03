import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "@/src/auth";

export default function AdminLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && (!user || !user.is_admin)) {
      router.replace("/(tabs)");
    }
  }, [user, loading]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
