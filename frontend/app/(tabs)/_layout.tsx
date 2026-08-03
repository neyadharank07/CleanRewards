import React, { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";

export default function TabsLayout() {
  const t = useTheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/(auth)/login");
  }, [user, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          height: Platform.OS === "ios" ? 84 : 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
          tabBarButtonTestID: "tab-map",
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Ranks",
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
          tabBarButtonTestID: "tab-leaderboard",
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: "Rewards",
          tabBarIcon: ({ color, size }) => <Ionicons name="gift" size={size} color={color} />,
          tabBarButtonTestID: "tab-rewards",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
