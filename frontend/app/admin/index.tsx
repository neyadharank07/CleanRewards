import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, AdminStats } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing, shadowCard } from "@/src/theme";

export default function AdminHome() {
  const t = useTheme();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api.adminStats());
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
        <Pressable testID="admin-back" onPress={() => router.replace("/(tabs)/profile")} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Admin Dashboard</Txt>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}
      >
        <Txt variant="title" weight="medium">Overview</Txt>

        <View style={styles.grid}>
          <StatCard testID="admin-stat-users" label="Users" value={stats?.users ?? 0} icon="people" tint={t.brand} />
          <StatCard testID="admin-stat-missions" label="Missions" value={stats?.missions ?? 0} icon="location" tint={t.info} />
          <StatCard testID="admin-stat-cleanups" label="Cleanups" value={stats?.cleanups ?? 0} icon="checkmark-done" tint={t.brand} />
          <StatCard testID="admin-stat-pending" label="Pending review" value={stats?.pending_review ?? 0} icon="hourglass" tint={t.warning} />
          <StatCard testID="admin-stat-reports" label="Reports" value={stats?.reports ?? 0} icon="alert" tint={t.error} />
          <StatCard testID="admin-stat-pending-redemptions" label="Pending redemptions" value={stats?.pending_redemptions ?? 0} icon="gift" tint={t.warning} />
          <StatCard testID="admin-stat-robots" label="Robots" value={stats?.robots ?? 0} icon="hardware-chip" tint={t.info} />
          <StatCard testID="admin-stat-detections" label="Detections" value={stats?.robot_detections ?? 0} icon="scan" tint={t.brand} />
        </View>

        <Txt variant="subtitle" weight="medium" style={{ marginTop: spacing.md }}>Manage</Txt>

        <NavRow testID="admin-nav-submissions" icon="images" label="Cleanup submissions" onPress={() => router.push("/admin/submissions")} />
        <NavRow testID="admin-nav-missions" icon="location" label="Missions" onPress={() => router.push("/admin/missions")} />
        <NavRow testID="admin-nav-rewards" icon="gift" label="Rewards" onPress={() => router.push("/admin/rewards")} />
        <NavRow testID="admin-nav-redemptions" icon="ticket" label="Redemptions" onPress={() => router.push("/admin/redemptions")} />
        <NavRow testID="admin-nav-robots" icon="hardware-chip" label="Robots" onPress={() => router.push("/admin/robots")} />
        <NavRow testID="admin-nav-users" icon="people" label="Users" onPress={() => router.push("/admin/users")} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon, tint, testID }: { label: string; value: number; icon: any; tint: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.stat, shadowCard, { backgroundColor: t.surfaceSecondary }]}>
      <View style={[styles.statIcon, { backgroundColor: t.surface }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Txt variant="caption" color={t.onSurfaceSecondary}>{label}</Txt>
      <Txt variant="subtitle" weight="medium">{value}</Txt>
    </View>
  );
}

function NavRow({ label, icon, onPress, testID }: { label: string; icon: any; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.nav, { backgroundColor: t.surfaceSecondary }]}>
      <View style={[styles.navIcon, { backgroundColor: t.brandSecondary }]}>
        <Ionicons name={icon} size={20} color={t.onBrandSecondary} />
      </View>
      <Txt weight="medium" style={{ flex: 1 }}>{label}</Txt>
      <Ionicons name="chevron-forward" size={18} color={t.onSurfaceTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  stat: { width: "48%", padding: spacing.md, borderRadius: radius.lg, gap: 4 },
  statIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  nav: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  navIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
