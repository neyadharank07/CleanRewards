import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Mission } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing, shadowCard } from "@/src/theme";

type Pin = {
  id: string;
  title: string;
  subtitle: string;
  status: "completed" | "open" | "reported" | "reserved" | "expired" | "robot-detected";
  lat: number;
  lng: number;
  onPress?: () => void;
};

export default function MapScreen() {
  const t = useTheme();
  const [pins, setPins] = useState<Pin[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "reported" | "robot" | "reserved">("all");

  const load = useCallback(async () => {
    try {
      const [missions, cleanups, reports] = await Promise.all([
        api.listMissions(),
        api.allCleanups(),
        api.listReports(),
      ]);
      const now = Date.now();
      const missionPins: Pin[] = (missions as Mission[]).map((m) => {
        const expired = m.expires_at ? new Date(m.expires_at).getTime() < now : false;
        const reserved = m.claimed_until ? new Date(m.claimed_until).getTime() > now : false;
        let status: Pin["status"] = "open";
        if (m.status === "completed") status = "completed";
        else if (expired) status = "expired";
        else if (reserved) status = "reserved";
        else if (m.source === "robot") status = "robot-detected";
        return {
          id: `mission-${m.id}`,
          title: m.title,
          subtitle: `${m.location} • ${m.points} pts${m.source === "robot" ? " • robot" : ""}`,
          status,
          lat: m.lat,
          lng: m.lng,
          onPress: m.status !== "completed"
            ? () => router.push({ pathname: "/cleanup", params: { mission_id: m.id, difficulty: m.difficulty } })
            : undefined,
        };
      });
      const cleanupPins: Pin[] = cleanups.slice(0, 30).map((c: any, i: number) => ({
        id: `cleanup-${c.id || i}`,
        title: "Cleanup completed",
        subtitle: new Date(c.created_at).toLocaleDateString(),
        status: "completed",
        lat: c.lat,
        lng: c.lng,
      }));
      const reportPins: Pin[] = reports.slice(0, 30).map((r: any) => ({
        id: `report-${r.id}`,
        title: "Reported litter",
        subtitle: r.description || "Needs cleanup",
        status: "reported",
        lat: r.lat,
        lng: r.lng,
      }));
      setPins([...missionPins, ...reportPins, ...cleanupPins]);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = pins.filter((p) => {
    if (filter === "all") return true;
    if (filter === "robot") return p.status === "robot-detected";
    if (filter === "reserved") return p.status === "reserved";
    if (filter === "open") return p.status === "open" || p.status === "robot-detected";
    return p.status === filter;
  });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.header}>
        <Txt variant="title" weight="medium">Map</Txt>
        <Txt variant="caption" color={t.onSurfaceSecondary}>
          Missions, reports, and completed cleanups near you.
        </Txt>
      </View>

      <View style={{ height: 56 }}>
        <FlatList
          data={[
            { id: "all", label: "All" },
            { id: "open", label: "Open" },
            { id: "robot", label: "Robot" },
            { id: "reserved", label: "Reserved" },
            { id: "reported", label: "Reported" },
            { id: "completed", label: "Completed" },
          ]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
          renderItem={({ item }) => {
            const active = filter === item.id;
            return (
              <Pressable
                testID={`map-filter-${item.id}`}
                onPress={() => setFilter(item.id as any)}
                style={{
                  paddingHorizontal: spacing.lg,
                  height: 36,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? t.brand : t.surfaceSecondary,
                  flexShrink: 0,
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
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} />}
        renderItem={({ item }) => {
          const pinBg =
            item.status === "completed" ? t.brand :
            item.status === "reserved" ? t.info :
            item.status === "expired" ? t.onSurfaceTertiary :
            item.status === "reported" ? t.error :
            item.status === "robot-detected" ? t.error :
            t.warning;
          const iconName =
            item.status === "completed" ? "checkmark" :
            item.status === "reserved" ? "time" :
            item.status === "expired" ? "hourglass" :
            item.status === "reported" ? "alert" :
            item.status === "robot-detected" ? "hardware-chip" :
            "leaf";
          return (
            <Pressable
              testID={`pin-${item.id}`}
              disabled={!item.onPress}
              onPress={item.onPress}
              style={[styles.row, shadowCard, { backgroundColor: t.surfaceSecondary }]}
            >
              <View style={[styles.pinDot, { backgroundColor: pinBg }]}>
                <Ionicons name={iconName as any} size={16} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="medium">{item.title}</Txt>
                <Txt variant="caption" color={t.onSurfaceSecondary}>{item.subtitle}</Txt>
                <Txt variant="small" color={t.onSurfaceTertiary}>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</Txt>
              </View>
              {item.onPress && <Ionicons name="chevron-forward" size={18} color={t.onSurfaceTertiary} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <Txt color={t.onSurfaceSecondary}>No pins to show</Txt>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  pinDot: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
