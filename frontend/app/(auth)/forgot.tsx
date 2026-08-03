import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { spacing } from "@/src/theme";

export default function ForgotScreen() {
  const t = useTheme();
  const { resetPassword } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email || !pw) return show("Enter email and a new password", "error");
    setBusy(true);
    try {
      const msg = await resetPassword(email.trim(), pw);
      show(msg || "Password updated", "success");
      router.replace("/(auth)/login");
    } catch (e: any) {
      show(e.message || "Reset failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="forgot-back" onPress={() => router.back()} style={{ paddingBottom: spacing.lg }}>
            <Ionicons name="chevron-back" size={26} color={t.onSurface} />
          </Pressable>
          <Txt variant="display" weight="medium">Reset password</Txt>
          <Txt variant="body" color={t.onSurfaceSecondary} style={{ marginTop: spacing.xs }}>
            Enter your email and a new password to reset access.
          </Txt>

          <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
            <Field label="Email" testID="forgot-email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@cleanrewards.com" />
            <Field label="New password" testID="forgot-password" value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 6 characters" />
          </View>

          <Button title="Update password" testID="forgot-submit-button" onPress={onSubmit} loading={busy} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ scroll: { padding: spacing.xl, flexGrow: 1 } });
