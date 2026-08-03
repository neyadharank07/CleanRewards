import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Mission } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function AdminMissions() {
  const t = useTheme();
  const { show } = useToast();
  const [items, setItems] = useState<Mission[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("37.7749");
  const [lng, setLng] = useState("-122.4194");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [minutes, setMinutes] = useState("30");
  const [points, setPoints] = useState("100");
  const [image, setImage] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api.listMissions()); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title || !location) { show("Fill title and location", "error"); return; }
    setBusy(true);
    try {
      await api.adminCreateMission({
        title, location,
        lat: parseFloat(lat), lng: parseFloat(lng),
        difficulty, est_minutes: parseInt(minutes, 10) || 30,
        points: parseInt(points, 10) || 100,
        image_url: image || undefined,
      });
      show("Mission created — users notified", "success");
      setTitle(""); setLocation(""); setImage("");
      setShowForm(false);
      await load();
    } catch (e: any) {
      show(e.message || "Failed to create", "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await api.adminDeleteMission(id);
      show("Deleted", "success");
      await load();
    } catch (e: any) {
      show(e.message || "Delete failed", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="admin-missions-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Missions</Txt>
        <Pressable testID="admin-missions-add" onPress={() => setShowForm((v) => !v)} style={styles.iconBtn}>
          <Ionicons name={showForm ? "close" : "add"} size={24} color={t.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}>
        {showForm && (
          <View style={[styles.form, { backgroundColor: t.surfaceSecondary }]}>
            <Field label="Title" testID="new-mission-title" value={title} onChangeText={setTitle} autoCapitalize="words" />
            <Field label="Location" testID="new-mission-location" value={location} onChangeText={setLocation} autoCapitalize="words" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Latitude" testID="new-mission-lat" value={lat} onChangeText={setLat} keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Field label="Longitude" testID="new-mission-lng" value={lng} onChangeText={setLng} keyboardType="numeric" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Est minutes" testID="new-mission-min" value={minutes} onChangeText={setMinutes} keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Field label="Points" testID="new-mission-pts" value={points} onChangeText={setPoints} keyboardType="numeric" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(["easy", "medium", "hard"] as const).map((d) => {
                const active = difficulty === d;
                return (
                  <Pressable
                    key={d}
                    testID={`difficulty-${d}`}
                    onPress={() => setDifficulty(d)}
                    style={{
                      flex: 1, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
                      backgroundColor: active ? t.brand : t.surface,
                    }}
                  >
                    <Txt variant="caption" weight="medium" color={active ? t.onBrand : t.onSurface}>{d}</Txt>
                  </Pressable>
                );
              })}
            </View>
            <Field label="Image URL (optional)" testID="new-mission-image" value={image} onChangeText={setImage} />
            <Button title="Create mission" testID="create-mission-submit" onPress={create} loading={busy} />
          </View>
        )}

        <Txt variant="subtitle" weight="medium">All missions</Txt>
        {items.map((m) => (
          <View key={m.id} testID={`mission-row-${m.id}`} style={[styles.row, { backgroundColor: t.surfaceSecondary }]}>
            <Image source={{ uri: m.image_url }} style={{ width: 56, height: 56, borderRadius: radius.md }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Txt weight="medium" numberOfLines={1}>{m.title}</Txt>
              <Txt variant="small" color={t.onSurfaceSecondary} numberOfLines={1}>{m.location}</Txt>
              <Txt variant="small" color={t.onSurfaceSecondary}>{m.difficulty} • {m.est_minutes}m • +{m.points}</Txt>
            </View>
            <Pressable testID={`delete-mission-${m.id}`} onPress={() => del(m.id)} style={{ padding: 6 }}>
              <Ionicons name="trash" size={18} color={t.error} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
});
