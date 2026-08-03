import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { api } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { useToast } from "@/src/components/Toast";
import { radius, spacing } from "@/src/theme";

export default function ReportLitter() {
  const t = useTheme();
  const { show } = useToast();
  const [photo, setPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } else {
          setLocation({ lat: 37.7749, lng: -122.4194 });
        }
      } catch {
        setLocation({ lat: 37.7749, lng: -122.4194 });
      }
    })();
  }, []);

  const pick = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const launch = perm.status === "granted" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const r = await launch({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5, allowsEditing: true, aspect: [4, 3] });
    if (r.canceled) return;
    const a = r.assets[0];
    if (a.base64) setPhoto({ base64: a.base64, uri: a.uri });
  }, []);

  const submit = async () => {
    if (!photo) return show("Take a photo of the litter", "error");
    if (!description.trim()) return show("Add a short description", "error");
    if (!location) return show("Waiting for location...", "info");
    setBusy(true);
    try {
      await api.createReport({ description: description.trim(), lat: location.lat, lng: location.lng, photo_base64: photo.base64 });
      show("Report submitted. Thanks!", "success");
      router.back();
    } catch (e: any) {
      show(e.message || "Failed to submit", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="report-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Report Litter</Txt>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Txt variant="title" weight="medium">Help us map dirty spots</Txt>
          <Txt color={t.onSurfaceSecondary}>Your report helps volunteers know where to clean next.</Txt>

          <Pressable testID="report-photo-button" onPress={pick} style={[styles.photoBox, { backgroundColor: t.surfaceSecondary, borderColor: t.border }]}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ width: "100%", height: "100%", borderRadius: radius.lg }} contentFit="cover" />
            ) : (
              <View style={{ alignItems: "center", gap: spacing.sm }}>
                <Ionicons name="camera" size={36} color={t.brand} />
                <Txt weight="medium">Tap to capture</Txt>
              </View>
            )}
          </Pressable>

          <Field label="Description" testID="report-description" value={description} onChangeText={setDescription} placeholder="E.g. Plastic bottles under the bench" multiline autoCapitalize="sentences" />

          <View style={[styles.metaCard, { backgroundColor: t.brandSecondary }]}>
            <Ionicons name="location" size={18} color={t.onBrandSecondary} />
            <Txt color={t.onBrandSecondary}>
              {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Detecting..."}
            </Txt>
          </View>

          <Button title="Submit report" testID="report-submit-button" onPress={submit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  photoBox: { height: 240, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  metaCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
});
