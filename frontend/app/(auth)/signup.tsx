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
import { spacing, radius } from "@/src/theme";

export default function SignupScreen() {
  const t = useTheme();
  const { signup } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name || !username || !email || !password) {
      show("Fill in all fields", "error");
      return;
    }
    if (password.length < 6) {
      show("Password must be at least 6 chars", "error");
      return;
    }
    setBusy(true);
    try {
      await signup(name.trim(), username.trim(), email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      show(e.message || "Signup failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="signup-back" onPress={() => router.back()} style={{ paddingBottom: spacing.lg }}>
            <Ionicons name="chevron-back" size={26} color={t.onSurface} />
          </Pressable>
          <Txt variant="display" weight="medium">Create account</Txt>
          <Txt variant="body" color={t.onSurfaceSecondary} style={{ marginTop: spacing.xs }}>
            Start earning rewards for cleanups today.
          </Txt>

          <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
            <Field label="Name" testID="signup-name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Alex Rivera" />
            <Field label="Username" testID="signup-username" value={username} onChangeText={setUsername} placeholder="alex_r" />
            <Field label="Email" testID="signup-email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@cleanrewards.com" />
            <Field label="Password" testID="signup-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" />
          </View>

          <Button title="Create account" testID="signup-submit-button" onPress={onSubmit} loading={busy} style={{ marginTop: spacing.xl }} />

          <Pressable testID="go-to-login-link" onPress={() => router.replace("/(auth)/login")} style={{ marginTop: spacing.xl, alignItems: "center" }}>
            <Txt color={t.onSurfaceSecondary}>
              Already have an account? <Txt color={t.brand} weight="medium">Log in</Txt>
            </Txt>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ scroll: { padding: spacing.xl, flexGrow: 1 } });
