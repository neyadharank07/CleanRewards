import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { api, Robot } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function AdminRobots() {
  const t = useTheme();
  const { show } = useToast();
  const [items, setItems] = useState<Robot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [radiusMi, setRadiusMi] = useState("1.0");
  const [issuedKey, setIssuedKey] = useState<{ robotName: string; key: string } | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.adminListRobots()); } catch (e: any) { show(e.message || "Failed", "error"); }
  }, [show]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name) { show("Enter a name", "error"); return; }
    setBusy(true);
    try {
      const r = await api.adminRegisterRobot({ name, city, notify_radius_miles: parseFloat(radiusMi) || 1 });
      if (r.api_key) setIssuedKey({ robotName: r.name, key: r.api_key });
      setName(""); setCity(""); setRadiusMi("1.0");
      setShowForm(false);
      await load();
    } catch (e: any) {
      show(e.message || "Failed to register", "error");
    } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    try {
      await api.adminDeleteRobot(id);
      show("Deleted", "success");
      await load();
    } catch (e: any) { show(e.message || "Failed", "error"); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="admin-robots-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Robots</Txt>
        <Pressable testID="admin-robots-add" onPress={() => setShowForm((v) => !v)} style={styles.iconBtn}>
          <Ionicons name={showForm ? "close" : "add"} size={24} color={t.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}>
        {issuedKey && (
          <View testID="issued-key-card" style={[styles.keyCard, { backgroundColor: t.brand }]}>
            <Ionicons name="key" size={18} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Txt weight="medium" color="#FFF">API key for {issuedKey.robotName}</Txt>
              <Txt variant="small" color="rgba(255,255,255,0.85)">Save this now — it won&apos;t be shown again.</Txt>
              <Txt variant="small" color="#FFF" selectable>{issuedKey.key}</Txt>
            </View>
            <Pressable
              testID="copy-issued-key"
              onPress={async () => { await Clipboard.setStringAsync(issuedKey.key); show("Key copied", "success"); }}
              style={{ padding: 6 }}
            >
              <Ionicons name="copy" size={18} color="#FFF" />
            </Pressable>
          </View>
        )}

        {showForm && (
          <View style={[styles.form, { backgroundColor: t.surfaceSecondary }]}>
            <Field label="Robot name" testID="robot-name" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field label="City" testID="robot-city" value={city} onChangeText={setCity} autoCapitalize="words" />
            <Field label="Notify radius (miles)" testID="robot-radius" value={radiusMi} onChangeText={setRadiusMi} keyboardType="numeric" />
            <Button title="Register robot" testID="register-robot-submit" onPress={create} loading={busy} />
          </View>
        )}

        <Txt variant="subtitle" weight="medium">Fleet</Txt>
        {items.map((r) => (
          <Pressable
            key={r.id}
            testID={`robot-row-${r.id}`}
            onPress={() => router.push({ pathname: "/admin/robot-detail", params: { id: r.id } })}
            style={[styles.row, { backgroundColor: t.surfaceSecondary }]}
          >
            <View style={[styles.icon, { backgroundColor: r.online ? t.brand : t.onSurfaceTertiary }]}>
              <Ionicons name="hardware-chip" size={22} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="medium">{r.name}</Txt>
              <Txt variant="small" color={t.onSurfaceSecondary}>
                {r.city || "—"} • radius {r.notify_radius_miles} mi
              </Txt>
              <Txt variant="small" color={t.onSurfaceSecondary}>
                Battery {Math.round(r.battery)}% • {r.total_detections} detections • {r.missions_generated} missions
              </Txt>
              <Txt variant="small" color={r.online ? t.brand : t.error} weight="medium">
                {r.online ? "Online" : "Offline"}
              </Txt>
            </View>
            <Pressable testID={`delete-robot-${r.id}`} onPress={() => del(r.id)} style={{ padding: 6 }}>
              <Ionicons name="trash" size={18} color={t.error} />
            </Pressable>
          </Pressable>
        ))}
        {items.length === 0 && (
          <Txt color={t.onSurfaceSecondary} style={{ padding: spacing.xl, textAlign: "center" }}>
            No robots yet. Tap + to register one.
          </Txt>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  keyCard: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
});
