import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function AdminUsers() {
  const t = useTheme();
  const { user: me } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try { setItems(await api.adminListUsers()); } catch (e: any) { show(e.message || "Failed", "error"); }
  }, [show]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string) => {
    try {
      const r = await api.adminToggleAdmin(id);
      show(r.is_admin ? "Granted admin" : "Revoked admin", "success");
      await load();
    } catch (e: any) {
      show(e.message || "Failed", "error");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="admin-users-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Users</Txt>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm }}
        renderItem={({ item }) => {
          const isMe = item.id === me?.id;
          return (
            <View testID={`user-row-${item.id}`} style={[styles.row, { backgroundColor: t.surfaceSecondary }]}>
              <View style={[styles.avatar, { backgroundColor: t.brandSecondary }]}>
                <Ionicons name="person" size={18} color={t.onBrandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="medium" numberOfLines={1}>{item.name} {item.is_admin ? "• admin" : ""}</Txt>
                <Txt variant="small" color={t.onSurfaceSecondary} numberOfLines={1}>{item.email}</Txt>
                <Txt variant="small" color={t.onSurfaceSecondary}>{item.points} pts • {item.total_cleanups} cleanups</Txt>
              </View>
              <Button
                title={item.is_admin ? "Revoke" : "Make admin"}
                variant={item.is_admin ? "danger" : "primary"}
                disabled={isMe}
                testID={`toggle-admin-${item.id}`}
                onPress={() => toggle(item.id)}
                style={{ minHeight: 36, paddingHorizontal: 12 }}
              />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
