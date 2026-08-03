import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

const STATUS_COLORS: Record<string, string> = { pending: "#FF9F0A", fulfilled: "#34C759", rejected: "#FF3B30" };

export default function AdminRedemptions() {
  const t = useTheme();
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<"pending" | "fulfilled" | "rejected" | "all">("pending");

  const load = useCallback(async () => {
    try {
      const data = await api.adminListRedemptions(filter === "all" ? undefined : filter);
      setItems(data);
    } catch (e: any) {
      show(e.message || "Failed", "error");
    }
  }, [filter, show]);
  useEffect(() => { load(); }, [load]);

  const fulfill = async (id: string) => {
    try {
      const r = await api.adminFulfillRedemption(id);
      show(`Fulfilled — code ${r.code}`, "success");
      await load();
    } catch (e: any) {
      show(e.message || "Failed", "error");
    }
  };
  const reject = async (id: string) => {
    try {
      await api.adminRejectRedemption(id, "Rejected by admin");
      show("Rejected & points refunded", "success");
      await load();
    } catch (e: any) {
      show(e.message || "Failed", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="admin-red-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Redemptions</Txt>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ height: 56 }}>
        <FlatList
          data={[
            { id: "pending", label: "Pending" },
            { id: "fulfilled", label: "Fulfilled" },
            { id: "rejected", label: "Rejected" },
            { id: "all", label: "All" },
          ]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
          renderItem={({ item }) => {
            const active = filter === item.id;
            return (
              <Pressable
                testID={`red-filter-${item.id}`}
                onPress={() => setFilter(item.id as any)}
                style={{
                  paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: active ? t.brand : t.surfaceSecondary, flexShrink: 0,
                }}
              >
                <Txt variant="caption" weight="medium" color={active ? t.onBrand : t.onSurfaceSecondary}>{item.label}</Txt>
              </Pressable>
            );
          }}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}
        renderItem={({ item }) => (
          <View testID={`admin-redemption-${item.id}`} style={[styles.card, { backgroundColor: t.surfaceSecondary }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt weight="medium">{item.reward_title}</Txt>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: STATUS_COLORS[item.status] || "#8E8E93" }}>
                <Txt variant="small" weight="medium" color="#FFF">{item.status}</Txt>
              </View>
            </View>
            <Txt variant="small" color={t.onSurfaceSecondary}>User: {item.user?.name} ({item.user?.email})</Txt>
            <Txt variant="small" color={t.onSurfaceSecondary}>{item.cost} pts • {new Date(item.created_at).toLocaleString()}</Txt>
            {item.code && (
              <Txt variant="small" color={t.onBrandSecondary}>Code: {item.code}</Txt>
            )}
            {item.status === "pending" && (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <Button title="Fulfill" testID={`fulfill-${item.id}`} onPress={() => fulfill(item.id)} style={{ flex: 1, minHeight: 40 }} />
                <Button title="Reject" variant="danger" testID={`reject-red-${item.id}`} onPress={() => reject(item.id)} style={{ flex: 1, minHeight: 40 }} />
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Txt color={t.onSurfaceSecondary} style={{ padding: spacing.xl, textAlign: "center" }}>Nothing here.</Txt>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  card: { padding: spacing.md, borderRadius: radius.lg, gap: 4 },
});
