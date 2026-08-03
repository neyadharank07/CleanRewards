import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { api, LeaderboardRow } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing, shadowCard } from "@/src/theme";

type Period = "weekly" | "monthly" | "all";

export default function LeaderboardScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: Period) => {
    try {
      const data = await api.leaderboard(p);
      setRows(data);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  };

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const me = rows.find((r) => r.id === user?.id);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Txt variant="title" weight="medium">Leaderboard</Txt>
        <View style={[styles.segment, { backgroundColor: t.surfaceSecondary }]}>
          {(["weekly", "monthly", "all"] as Period[]).map((p) => {
            const active = period === p;
            return (
              <Pressable
                key={p}
                testID={`period-${p}`}
                onPress={() => setPeriod(p)}
                style={[styles.segmentBtn, { backgroundColor: active ? t.surface : "transparent" }]}
              >
                <Txt variant="caption" weight="medium" color={active ? t.onSurface : t.onSurfaceSecondary}>
                  {p === "all" ? "All time" : p.charAt(0).toUpperCase() + p.slice(1)}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={rest}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          top3.length ? (
            <View style={styles.podium}>
              {top3.map((r) => (
                <PodiumCard key={r.id} row={r} />
              ))}
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 140, gap: spacing.sm }}
        renderItem={({ item }) => <Row row={item} isMe={item.id === user?.id} />}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl }}>
            <Txt color={t.onSurfaceSecondary}>Be the first on the leaderboard.</Txt>
          </View>
        }
      />

      {me && (
        <View style={[styles.stickyMe, shadowCard, { backgroundColor: t.brand }]}>
          <Txt variant="caption" color="rgba(255,255,255,0.8)">YOUR POSITION</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Txt weight="medium" color="#FFF">#{me.rank}</Txt>
            <Txt weight="medium" color="#FFF" style={{ flex: 1 }}>{me.name}</Txt>
            <Txt weight="medium" color="#FFF">{me.points} pts</Txt>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function PodiumCard({ row }: { row: LeaderboardRow }) {
  const t = useTheme();
  const height = row.rank === 1 ? 140 : row.rank === 2 ? 120 : 100;
  return (
    <View testID={`podium-${row.rank}`} style={{ flex: 1, alignItems: "center", gap: spacing.xs }}>
      <View style={[styles.podiumAvatar, { borderColor: row.rank === 1 ? t.brand : t.border }]}>
        {row.profile_picture ? (
          <Image source={{ uri: row.profile_picture }} style={{ width: 56, height: 56, borderRadius: 28 }} />
        ) : (
          <Ionicons name="person" size={24} color={t.onSurfaceSecondary} />
        )}
      </View>
      <Txt variant="caption" weight="medium" numberOfLines={1}>{row.name}</Txt>
      <View style={{ backgroundColor: t.brandSecondary, height, width: "82%", borderRadius: radius.md, alignItems: "center", justifyContent: "flex-end", padding: spacing.sm }}>
        <Ionicons name={row.rank === 1 ? "trophy" : "medal"} size={18} color={t.onBrandSecondary} />
        <Txt variant="caption" weight="medium" color={t.onBrandSecondary}>#{row.rank}</Txt>
        <Txt variant="small" color={t.onBrandSecondary}>{row.points}</Txt>
      </View>
    </View>
  );
}

function Row({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  const t = useTheme();
  return (
    <View testID={`lb-row-${row.id}`} style={[styles.row, { backgroundColor: isMe ? t.brandSecondary : t.surfaceSecondary }]}>
      <Txt weight="medium" color={isMe ? t.onBrandSecondary : t.onSurface} style={{ width: 32 }}>#{row.rank}</Txt>
      <View style={[styles.avatar, { backgroundColor: t.surface }]}>
        {row.profile_picture ? (
          <Image source={{ uri: row.profile_picture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <Ionicons name="person" size={20} color={t.onSurfaceSecondary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="medium" numberOfLines={1}>{row.name}</Txt>
        <Txt variant="small" color={t.onSurfaceSecondary}>{row.total_cleanups} cleanups • {row.volunteer_hours.toFixed(1)}h</Txt>
      </View>
      <Txt weight="medium">{row.points}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", padding: 4, borderRadius: radius.pill, gap: 4 },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 36, borderRadius: radius.pill },
  podium: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: 0 },
  podiumAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  stickyMe: { position: "absolute", bottom: 100, left: spacing.lg, right: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, gap: 4 },
});
