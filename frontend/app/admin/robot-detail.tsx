import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { api, Robot, RobotDetection } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function RobotDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useToast();
  const [robot, setRobot] = useState<(Robot & { detections: RobotDetection[]; patrols: any[] }) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.adminGetRobot(id);
      setRobot(r);
    } catch (e: any) { show(e.message || "Failed", "error"); }
  }, [id, show]);
  useEffect(() => { load(); }, [load]);

  const simulate = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const r = await api.adminSimulateDetection(id);
      show(`Detected ${r.size} litter • +${r.points} pts mission created`, "success");
      await load();
    } catch (e: any) {
      show(e.message || "Simulation failed", "error");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="robot-detail-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium" numberOfLines={1}>{robot?.name || "Robot"}</Txt>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.brand} />}
      >
        {robot && (
          <>
            <View style={[styles.card, { backgroundColor: t.surfaceSecondary }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={[styles.icon, { backgroundColor: robot.connected ? t.brand : t.onSurfaceTertiary }]}>
                  <Ionicons name="hardware-chip" size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium">{robot.name}</Txt>
                  <Txt variant="small" color={t.onSurfaceSecondary}>{robot.city}</Txt>
                  <Txt variant="small" color={robot.connected ? t.brand : t.error} weight="medium">
                    {robot.connected ? "Online" : "Offline"}
                  </Txt>
                </View>
              </View>
              <View style={styles.grid}>
                <Stat label="Battery" value={`${Math.round(robot.battery)}%`} testID="robot-battery" />
                <Stat label="Detections" value={String(robot.total_detections)} testID="robot-total-detections" />
                <Stat label="Missions" value={String(robot.missions_generated)} testID="robot-missions" />
                <Stat label="Radius" value={`${robot.notify_radius_miles} mi`} testID="robot-radius-stat" />
              </View>
              {robot.lat != null && robot.lng != null && (
                <View style={[styles.gpsRow, { backgroundColor: t.brandSecondary }]}>
                  <Ionicons name="location" size={16} color={t.onBrandSecondary} />
                  <Txt variant="small" color={t.onBrandSecondary}>
                    {robot.lat.toFixed(4)}, {robot.lng.toFixed(4)}
                  </Txt>
                </View>
              )}
              <Txt variant="small" color={t.onSurfaceSecondary}>Last seen: {robot.last_seen || "never"}</Txt>
            </View>

            <Button
              title="Simulate detection"
              testID="simulate-detection-button"
              onPress={simulate}
              loading={busy}
            />

            <Txt variant="subtitle" weight="medium" style={{ marginTop: spacing.md }}>Recent detections</Txt>
            {robot.detections.length === 0 ? (
              <Txt color={t.onSurfaceSecondary}>No detections yet.</Txt>
            ) : (
              robot.detections.slice(0, 10).map((d) => (
                <View key={d.id} testID={`detection-${d.id}`} style={[styles.detection, { backgroundColor: t.surfaceSecondary }]}>
                  <View style={[styles.dSize, { backgroundColor: colorForSize(d.size, t) }]}>
                    <Txt variant="small" weight="medium" color="#FFF">{d.size[0]?.toUpperCase() || "?"}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="medium">{d.size} • {Math.round((d.confidence || 0) * 100)}% conf</Txt>
                    <Txt variant="small" color={t.onSurfaceSecondary}>
                      {d.lat.toFixed(3)}, {d.lng.toFixed(3)} • {new Date(d.created_at).toLocaleString()}
                    </Txt>
                    {d.ai_objects?.length > 0 && (
                      <Txt variant="small" color={t.onSurfaceSecondary}>
                        AI: {d.ai_objects.map((o) => `${o.label}(${Math.round(o.confidence * 100)}%)`).join(", ")}
                      </Txt>
                    )}
                  </View>
                </View>
              ))
            )}

            <Txt variant="subtitle" weight="medium" style={{ marginTop: spacing.md }}>Patrol logs</Txt>
            <Txt color={t.onSurfaceSecondary}>{robot.patrols.length} patrol batches uploaded.</Txt>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function colorForSize(size: string, t: any): string {
  if (size === "small") return "#8E8E93";
  if (size === "medium") return t.warning;
  if (size === "large") return t.error;
  return "#5856D6";
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: t.surface }]}>
      <Txt variant="subtitle" weight="medium">{value}</Txt>
      <Txt variant="small" color={t.onSurfaceSecondary}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  card: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  stat: { width: "48%", padding: spacing.md, borderRadius: radius.md, gap: 2 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.sm, borderRadius: radius.pill, alignSelf: "flex-start" },
  detection: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  dSize: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
