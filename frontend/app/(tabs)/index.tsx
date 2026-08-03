import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { api, Mission } from "@/src/api";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { radius, shadowCard, spacing } from "@/src/theme";

const HERO_URL =
  "https://images.unsplash.com/photo-1640287807682-b3195cc6b320?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwxfHxjbGVhbiUyMGNpdHklMjBwYXJrJTIwdHJlZXN8ZW58MHx8fHwxNzgzMjY1NDA3fDA&ixlib=rb-4.1.0&q=85";

export default function HomeScreen() {
  const t = useTheme();
  const { user, refresh } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, lb] = await Promise.all([api.listMissions(), api.leaderboard("all")]);
      setMissions(m.filter((x) => x.status !== "completed"));
      const mine = lb.find((r) => r.id === user?.id);
      setRank(mine ? mine.rank : null);
    } catch { /* ignore */ }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), load()]);
    setRefreshing(false);
  };

  const today = missions[0];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}
        testID="home-scroll"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color={t.onSurfaceSecondary}>Welcome back,</Txt>
            <Txt variant="title" weight="medium" testID="home-greeting">{user?.name || "Volunteer"}</Txt>
          </View>
          <Pressable testID="notifications-button" onPress={() => router.push("/notifications")} style={[styles.headerIcon, { backgroundColor: t.surfaceSecondary }]}>
            <Ionicons name="notifications-outline" size={22} color={t.onSurface} />
          </Pressable>
        </View>

        {/* Hero mission / today */}
        <View style={[styles.hero, shadowCard]}>
          <Image source={{ uri: today?.image_url || HERO_URL }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFillObject} />
          <View style={{ flex: 1 }} />
          <View style={{ padding: spacing.lg, gap: spacing.xs }}>
            <Txt variant="caption" color="rgba(255,255,255,0.85)">TODAY&apos;S MISSION</Txt>
            <Txt variant="subtitle" weight="medium" color="#FFF">{today?.title || "Explore missions near you"}</Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.85)">
              {today ? `${today.location} • ${today.est_minutes} min • ${today.points} pts` : "Pull down to refresh"}
            </Txt>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.grid}>
          <StatCard testID="stat-points" label="Total Points" value={String(user?.points ?? 0)} icon="flash" color={t.brand} />
          <StatCard testID="stat-streak" label="Streak" value={`${user?.current_streak ?? 0} d`} icon="flame" color={t.warning} />
          <StatCard testID="stat-cleanups" label="Cleanups" value={String(user?.total_cleanups ?? 0)} icon="checkmark-circle" color={t.info} />
          <StatCard testID="stat-rank" label="Rank" value={rank ? `#${rank}` : "—"} icon="trophy" color={t.onBrandSecondary} />
        </View>

        {/* CTA */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button title="Start Cleanup" testID="start-cleanup-button" onPress={() => router.push("/cleanup")} />
          <Button title="Report Litter" variant="ghost" testID="report-litter-button" onPress={() => router.push("/report")} />
        </View>

        {/* Nearby missions */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Txt variant="subtitle" weight="medium">Nearby Missions</Txt>
          <FlatList
            data={missions}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                testID={`mission-card-${item.id}`}
                onPress={() => router.push({ pathname: "/cleanup", params: { mission_id: item.id, difficulty: item.difficulty } })}
                style={[styles.missionCard, shadowCard, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Image source={{ uri: item.image_url }} style={styles.missionImg} contentFit="cover" />
                {item.source === "robot" && (
                  <View style={[styles.robotBadge, { backgroundColor: t.error }]}>
                    <Ionicons name="hardware-chip" size={12} color="#FFF" />
                    <Txt variant="small" weight="medium" color="#FFF">Robot</Txt>
                  </View>
                )}
                <View style={{ padding: spacing.md, gap: spacing.xs }}>
                  <Txt weight="medium" numberOfLines={1}>{item.title}</Txt>
                  <Txt variant="caption" color={t.onSurfaceSecondary} numberOfLines={1}>{item.location}</Txt>
                  <View style={styles.pillsRow}>
                    <Pill text={item.difficulty} bg={t.brandSecondary} color={t.onBrandSecondary} />
                    <Pill text={`${item.est_minutes}m`} bg={t.surfaceSecondary} color={t.onSurfaceSecondary} />
                    <Pill text={`+${item.points}`} bg={t.brand} color={t.onBrand} />
                  </View>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: spacing.lg }}>
                <Txt color={t.onSurfaceSecondary}>No open missions. Pull to refresh.</Txt>
              </View>
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon, color, testID }: { label: string; value: string; icon: any; color: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: t.surfaceSecondary }]}>
      <View style={[styles.statIcon, { backgroundColor: t.surface }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Txt variant="caption" color={t.onSurfaceSecondary}>{label}</Txt>
      <Txt variant="subtitle" weight="medium">{value}</Txt>
    </View>
  );
}

function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
      <Txt variant="small" weight="medium" color={color}>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  headerIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  hero: { height: 200, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "#111" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: spacing.lg, gap: spacing.md },
  stat: { width: "48%", padding: spacing.lg, borderRadius: radius.lg, gap: spacing.sm },
  statIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  missionCard: { width: 240, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  missionImg: { width: "100%", height: 120 },
  robotBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillsRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
});
