import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Reward } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

const IMAGE_OPTIONS = ["coffee", "drink", "movie", "park"] as const;

export default function AdminRewards() {
  const t = useTheme();
  const { show } = useToast();
  const [items, setItems] = useState<Reward[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("500");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<(typeof IMAGE_OPTIONS)[number]>("coffee");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.rewards()); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title) { show("Enter a title", "error"); return; }
    setBusy(true);
    try {
      await api.adminCreateReward({ title, cost: parseInt(cost, 10) || 100, image, description });
      show("Reward added", "success");
      setTitle(""); setCost("500"); setDescription("");
      setShowForm(false);
      await load();
    } catch (e: any) {
      show(e.message || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await api.adminDeleteReward(id);
      show("Deactivated", "success");
      await load();
    } catch (e: any) {
      show(e.message || "Failed", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="admin-rewards-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Rewards</Txt>
        <Pressable testID="admin-rewards-add" onPress={() => setShowForm((v) => !v)} style={styles.iconBtn}>
          <Ionicons name={showForm ? "close" : "add"} size={24} color={t.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md }}>
        {showForm && (
          <View style={[styles.form, { backgroundColor: t.surfaceSecondary }]}>
            <Field label="Title" testID="new-reward-title" value={title} onChangeText={setTitle} autoCapitalize="words" />
            <Field label="Cost (points)" testID="new-reward-cost" value={cost} onChangeText={setCost} keyboardType="numeric" />
            <Field label="Description" testID="new-reward-desc" value={description} onChangeText={setDescription} autoCapitalize="sentences" />
            <Txt variant="caption" color={t.onSurfaceSecondary}>Image style</Txt>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {IMAGE_OPTIONS.map((opt) => {
                const active = image === opt;
                return (
                  <Pressable
                    key={opt}
                    testID={`image-${opt}`}
                    onPress={() => setImage(opt)}
                    style={{
                      flex: 1, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
                      backgroundColor: active ? t.brand : t.surface,
                    }}
                  >
                    <Txt variant="caption" weight="medium" color={active ? t.onBrand : t.onSurface}>{opt}</Txt>
                  </Pressable>
                );
              })}
            </View>
            <Button title="Create reward" testID="create-reward-submit" onPress={create} loading={busy} />
          </View>
        )}
        <Txt variant="subtitle" weight="medium">Active rewards</Txt>
        {items.map((r) => (
          <View key={r.id} testID={`reward-row-${r.id}`} style={[styles.row, { backgroundColor: t.surfaceSecondary }]}>
            <View style={[styles.iconBox, { backgroundColor: t.brandSecondary }]}>
              <Ionicons name="gift" size={20} color={t.onBrandSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="medium">{r.title}</Txt>
              <Txt variant="small" color={t.onSurfaceSecondary}>{r.cost} pts • {r.image}</Txt>
              {r.description ? <Txt variant="small" color={t.onSurfaceSecondary}>{r.description}</Txt> : null}
            </View>
            <Pressable testID={`delete-reward-${r.id}`} onPress={() => del(r.id)} style={{ padding: 6 }}>
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
  iconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
