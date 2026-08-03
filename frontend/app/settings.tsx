import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function SettingsScreen() {
  const t = useTheme();
  const { user, refresh, logout } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateMe({ name, username, bio });
      await refresh();
      show("Profile updated", "success");
    } catch (e: any) {
      show(e.message || "Update failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Settings</Txt>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.huge }} keyboardShouldPersistTaps="handled">
          <Field label="Name" testID="settings-name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Username" testID="settings-username" value={username} onChangeText={setUsername} />
          <Field label="Bio" testID="settings-bio" value={bio} onChangeText={setBio} multiline autoCapitalize="sentences" />

          <Button title="Save changes" testID="settings-save-button" onPress={save} loading={busy} />
          <Button title="Log out" variant="ghost" testID="settings-logout-button" onPress={() => logout().then(() => router.replace("/(auth)/login"))} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
