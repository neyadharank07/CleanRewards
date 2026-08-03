import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { spacing, radius } from "@/src/theme";

export default function LoginScreen() {
  const t = useTheme();
  const { login, googleLogin } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"pw" | "google" | null>(null);

  const onLogin = async () => {
    if (!email || !password) {
      show("Enter email and password", "error");
      return;
    }
    setBusy("pw");
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      show(e.message || "Login failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    setBusy("google");
    try {
      await googleLogin();
      router.replace("/(tabs)");
    } catch (e: any) {
      show(e.message || "Google login failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.logoRow]}>
            <View style={[styles.logoDot, { backgroundColor: t.brand }]}>
              <Ionicons name="leaf" size={28} color="#FFF" />
            </View>
            <Txt variant="display" weight="medium">CleanRewards</Txt>
            <Txt variant="body" color={t.onSurfaceSecondary} style={{ marginTop: spacing.xs }}>
              Earn points for keeping your city clean.
            </Txt>
          </View>

          <View style={{ gap: spacing.lg, marginTop: spacing.xxl }}>
            <Field label="Email" testID="login-email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@cleanrewards.com" />
            <Field label="Password" testID="login-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" />
            <Pressable testID="forgot-password-link" onPress={() => router.push("/(auth)/forgot")} style={{ alignSelf: "flex-end" }}>
              <Txt variant="caption" color={t.brand} weight="medium">Forgot password?</Txt>
            </Pressable>
          </View>

          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            <Button testID="login-submit-button" title="Log in" onPress={onLogin} loading={busy === "pw"} />
            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: t.border }]} />
              <Txt variant="caption" color={t.onSurfaceTertiary}>OR</Txt>
              <View style={[styles.line, { backgroundColor: t.border }]} />
            </View>
            <Button
              testID="google-login-button"
              title="Continue with Google"
              variant="ghost"
              onPress={onGoogle}
              loading={busy === "google"}
            />
          </View>

          <Pressable testID="go-to-signup-link" onPress={() => router.push("/(auth)/signup")} style={{ marginTop: spacing.xxl, alignItems: "center" }}>
            <Txt color={t.onSurfaceSecondary}>
              New here? <Txt color={t.brand} weight="medium">Create an account</Txt>
            </Txt>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl, flexGrow: 1 },
  logoRow: { alignItems: "flex-start", gap: spacing.md },
  logoDot: { width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: 1 },
});
