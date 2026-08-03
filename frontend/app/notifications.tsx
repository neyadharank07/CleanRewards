import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing } from "@/src/theme";

const ICONS: Record<string, any> = {
  mission: "location",
  streak: "flame",
  challenge: "trophy",
  reward: "gift",
};

export default function NotificationsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api.notifications().then(setItems).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="notif-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Notifications</Txt>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        renderItem={({ item }) => (
          <View testID={`notif-${item.id}`} style={[styles.row, { backgroundColor: t.surfaceSecondary }]}>
            <View style={[styles.icon, { backgroundColor: t.brand }]}>
              <Ionicons name={ICONS[item.type] || "notifications"} size={18} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="medium">{item.title}</Txt>
              <Txt variant="caption" color={t.onSurfaceSecondary}>{item.body}</Txt>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <Txt color={t.onSurfaceSecondary}>You&apos;re all caught up.</Txt>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
