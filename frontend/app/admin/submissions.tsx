import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

type Filter = "pending_review" | "approved" | "rejected" | "all";

export default function AdminSubmissions() {
  const t = useTheme();
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("pending_review");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.adminListCleanups(filter === "all" ? undefined : filter);
      setItems(data);
    } catch (e: any) {
      show(e.message || "Failed to load", "error");
    }
  }, [filter, show]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, approved: boolean) => {
    try {
      await api.adminReviewCleanup(id, approved, "");
      show(approved ? "Approved" : "Rejected", "success");
      await load();
    } catch (e: any) {
      show(e.message || "Action failed", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <Top title="Submissions" />
      <View style={{ height: 56 }}>
        <FlatList
          data={[
            { id: "pending_review", label: "Pending" },
            { id: "approved", label: "Approved" },
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
                testID={`subs-filter-${item.id}`}
                onPress={() => setFilter(item.id as Filter)}
                style={{
                  paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: active ? t.brand : t.surfaceSecondary, flexShrink: 0,
                }}
              >
                <Txt variant="caption" weight="medium" color={active ? t.onBrand : t.onSurfaceSecondary}>
                  {item.label}
                </Txt>
              </Pressable>
            );
          }}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.brand} />
        }
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}
        renderItem={({ item }) => (
          <View testID={`submission-${item.id}`} style={[styles.card, { backgroundColor: t.surfaceSecondary }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt weight="medium">{item.user?.name || "Unknown"}</Txt>
              <Txt variant="caption" color={t.onSurfaceSecondary}>{item.status}</Txt>
            </View>
            <Txt variant="small" color={t.onSurfaceSecondary}>{new Date(item.created_at).toLocaleString()}</Txt>
            <Txt variant="small" color={t.onSurfaceSecondary}>
              {item.difficulty} • {item.lat?.toFixed?.(3)}, {item.lng?.toFixed?.(3)}
            </Txt>
            {item.ai_result?.reason && (
              <Txt variant="small" color={t.onSurfaceSecondary}>AI: {item.ai_result.reason}</Txt>
            )}
            {item.status === "pending_review" && (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <Button title="Approve" testID={`approve-${item.id}`} onPress={() => decide(item.id, true)} style={{ flex: 1, minHeight: 40 }} />
                <Button title="Reject" variant="danger" testID={`reject-${item.id}`} onPress={() => decide(item.id, false)} style={{ flex: 1, minHeight: 40 }} />
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Txt color={t.onSurfaceSecondary} style={{ padding: spacing.xl, textAlign: "center" }}>Nothing here.</Txt>}
      />
    </SafeAreaView>
  );
}

function Top({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={styles.top}>
      <Pressable testID="admin-sub-back" onPress={() => router.back()} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={26} color={t.onSurface} />
      </Pressable>
      <Txt weight="medium">{title}</Txt>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  card: { padding: spacing.md, borderRadius: radius.lg, gap: 4 },
});
