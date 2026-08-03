import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Redemption } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing } from "@/src/theme";

const STATUS_COLORS: Record<string, string> = {
  pending: "#FF9F0A",
  fulfilled: "#34C759",
  rejected: "#FF3B30",
};

export default function RedemptionsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Redemption[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myRedemptions();
      setItems(r);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="redemptions-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">My Redemptions</Txt>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}
        renderItem={({ item }) => (
          <View testID={`redemption-${item.id}`} style={[styles.row, { backgroundColor: t.surfaceSecondary }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt weight="medium">{item.reward_title}</Txt>
              <Txt variant="small" color={t.onSurfaceSecondary}>
                {new Date(item.created_at).toLocaleString()} • {item.cost} pts
              </Txt>
              {item.status === "fulfilled" && item.code && (
                <View style={[styles.code, { backgroundColor: t.brandSecondary }]}>
                  <Ionicons name="pricetag" size={12} color={t.onBrandSecondary} />
                  <Txt variant="small" weight="medium" color={t.onBrandSecondary}>{item.code}</Txt>
                </View>
              )}
              {item.status === "rejected" && item.note && (
                <Txt variant="small" color={t.onSurfaceSecondary}>Note: {item.note}</Txt>
              )}
            </View>
            <View style={[styles.pill, { backgroundColor: STATUS_COLORS[item.status] || "#8E8E93" }]}>
              <Txt variant="small" weight="medium" color="#FFF">{item.status}</Txt>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <Txt color={t.onSurfaceSecondary}>You haven&apos;t redeemed any rewards yet.</Txt>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, gap: spacing.md },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  code: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
});
