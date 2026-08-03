import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Badge } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { radius, spacing, shadowCard } from "@/src/theme";

export default function ProfileScreen() {
  const t = useTheme();
  const { user, logout, refresh } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activity, setActivity] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([api.badges(), api.myCleanups()]);
      setBadges(b);
      setActivity(c);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); refresh(); }, [load, refresh]);

  const earned = new Set(user?.badges || []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
          <Txt variant="title" weight="medium">Profile</Txt>
          <Pressable testID="profile-settings-button" onPress={() => router.push("/settings")} style={[styles.iconBtn, { backgroundColor: t.surfaceSecondary }]}>
            <Ionicons name="settings-outline" size={20} color={t.onSurface} />
          </Pressable>
        </View>

        <View style={styles.headerCard}>
          <View style={[styles.avatar, { backgroundColor: t.brandSecondary }]}>
            {user?.profile_picture ? (
              <Image source={{ uri: user.profile_picture }} style={{ width: 88, height: 88, borderRadius: 44 }} />
            ) : (
              <Ionicons name="person" size={40} color={t.onBrandSecondary} />
            )}
          </View>
          <Txt variant="subtitle" weight="medium" testID="profile-name">{user?.name}</Txt>
          <Txt variant="caption" color={t.onSurfaceSecondary}>@{user?.username}</Txt>
          <Txt variant="body" color={t.onSurfaceSecondary} style={{ textAlign: "center", marginTop: spacing.sm }}>
            {user?.bio || "Making my community cleaner."}
          </Txt>
        </View>

        <View style={styles.stats}>
          <Stat label="Points" value={user?.points ?? 0} testID="profile-points" />
          <Stat label="Cleanups" value={user?.total_cleanups ?? 0} testID="profile-cleanups" />
          <Stat label="Hours" value={(user?.volunteer_hours ?? 0).toFixed(1)} testID="profile-hours" />
          <Stat label="Streak" value={`${user?.current_streak ?? 0}d`} testID="profile-streak" />
        </View>

        <Section title="Badges">
          <FlatList
            data={badges}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(b) => b.id}
            contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.md }}
            renderItem={({ item }) => {
              const has = earned.has(item.id);
              return (
                <View testID={`badge-${item.id}`} style={[styles.badge, { backgroundColor: has ? t.brandSecondary : t.surfaceSecondary, opacity: has ? 1 : 0.55 }]}>
                  <View style={[styles.badgeIcon, { backgroundColor: has ? t.brand : t.surfaceTertiary }]}>
                    <Ionicons name={mapBadgeIcon(item.icon)} size={22} color={has ? "#FFF" : t.onSurfaceTertiary} />
                  </View>
                  <Txt variant="caption" weight="medium" numberOfLines={1}>{item.name}</Txt>
                  <Txt variant="small" color={t.onSurfaceSecondary} numberOfLines={2}>{item.description}</Txt>
                </View>
              );
            }}
          />
        </Section>

        <Section title="Recent Activity">
          {activity.length === 0 ? (
            <Txt color={t.onSurfaceSecondary}>No activity yet. Complete a cleanup!</Txt>
          ) : (
            activity.slice(0, 5).map((c) => (
              <View key={c.id} style={[styles.activityRow, { backgroundColor: t.surfaceSecondary }]}>
                <View style={[styles.actIcon, { backgroundColor: c.verified ? t.brand : t.warning }]}>
                  <Ionicons name={c.verified ? "checkmark" : "hourglass"} size={16} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium">{c.verified ? "Cleanup verified" : "Under review"}</Txt>
                  <Txt variant="small" color={t.onSurfaceSecondary}>
                    {new Date(c.created_at).toLocaleString()} • {c.difficulty}
                  </Txt>
                </View>
                <Txt weight="medium" color={t.brand}>+{c.points}</Txt>
              </View>
            ))
          )}
        </Section>

        <Button title="Log out" variant="ghost" testID="profile-logout-button" onPress={() => logout().then(() => router.replace("/(auth)/login"))} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function mapBadgeIcon(id: string): any {
  switch (id) {
    case "leaf": return "leaf";
    case "home": return "home";
    case "tree": return "leaf-outline";
    case "trophy": return "trophy";
    case "flame": return "flame";
    case "ribbon": return "ribbon";
    default: return "star";
  }
}

function Stat({ label, value, testID }: { label: string; value: any; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: t.surfaceSecondary }]}>
      <Txt variant="subtitle" weight="medium">{value}</Txt>
      <Txt variant="small" color={t.onSurfaceSecondary}>{label}</Txt>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
      <Txt variant="subtitle" weight="medium">{title}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  headerCard: { alignItems: "center", gap: 4, marginBottom: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  stats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  stat: { width: "48%", padding: spacing.md, borderRadius: radius.md, gap: 2 },
  badge: { width: 160, padding: spacing.md, borderRadius: radius.lg, gap: 6 },
  badgeIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  actIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
