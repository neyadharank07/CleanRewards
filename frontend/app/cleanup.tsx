import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing, shadowCard } from "@/src/theme";

type Step = "intro" | "before" | "after" | "verifying" | "result";

export default function CleanupFlow() {
  const t = useTheme();
  const { show } = useToast();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ mission_id?: string; difficulty?: string }>();

  const [step, setStep] = useState<Step>("intro");
  const [before, setBefore] = useState<{ base64: string; uri: string } | null>(null);
  const [after, setAfter] = useState<{ base64: string; uri: string } | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [ts, setTs] = useState<string>("");
  const [result, setResult] = useState<any>(null);

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

  const pickImage = useCallback(async (which: "before" | "after") => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const launch = perm.status === "granted"
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
      const res = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.5,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        show("Could not read image", "error");
        return;
      }
      if (which === "before") {
        setBefore({ base64: asset.base64, uri: asset.uri });
        setTs(new Date().toISOString());
      } else {
        setAfter({ base64: asset.base64, uri: asset.uri });
      }
    } catch (e: any) {
      show(e.message || "Camera error", "error");
    }
  }, [show]);

  const submit = useCallback(async () => {
    if (!before || !after || !location) return;
    setStep("verifying");
    try {
      const r = await api.submitCleanup({
        mission_id: params.mission_id,
        lat: location.lat,
        lng: location.lng,
        before_photo: before.base64,
        after_photo: after.base64,
        difficulty: (params.difficulty as string) || "medium",
      });
      setResult(r);
      await refresh();
      setStep("result");
    } catch (e: any) {
      show(e.message || "Verification failed", "error");
      setStep("after");
    }
  }, [before, after, location, params.mission_id, params.difficulty, refresh, show]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={styles.top}>
        <Pressable testID="cleanup-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={t.onSurface} />
        </Pressable>
        <Txt weight="medium">Cleanup</Txt>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg }}>
        <StepIndicator step={step} />

        {step === "intro" && (
          <View style={{ gap: spacing.md }}>
            <Txt variant="title" weight="medium">How it works</Txt>
            <InstructionRow n={1} title="Take a BEFORE photo" desc="Clearly show the littered area." />
            <InstructionRow n={2} title="Clean the area" desc="Bag the trash and dispose safely." />
            <InstructionRow n={3} title="Take an AFTER photo" desc="Same spot, same angle if possible." />
            <InstructionRow n={4} title="AI verifies" desc="You earn points instantly on approval." />
            <View style={[styles.metaCard, { backgroundColor: t.brandSecondary }]}>
              <Ionicons name="location" size={18} color={t.onBrandSecondary} />
              <Txt color={t.onBrandSecondary}>
                Location: {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Detecting..."}
              </Txt>
            </View>
            {params.mission_id && (
              <Button
                title="Reserve this mission (15 min)"
                variant="ghost"
                testID="reserve-mission-button"
                onPress={async () => {
                  try {
                    await api.claimMission(params.mission_id as string);
                    show("Reserved for 15 minutes", "success");
                  } catch (e: any) {
                    show(e.message || "Reserve failed", "error");
                  }
                }}
              />
            )}
            <Button testID="cleanup-start-button" title="Start" onPress={() => setStep("before")} />
          </View>
        )}

        {step === "before" && (
          <PhotoStep
            title="Take BEFORE photo"
            subtitle="Show the littered area clearly."
            preview={before?.uri}
            onCapture={() => pickImage("before")}
            onNext={() => before && setStep("after")}
            nextTestID="before-next-button"
          />
        )}

        {step === "after" && (
          <PhotoStep
            title="Take AFTER photo"
            subtitle="Same location — cleaned up."
            preview={after?.uri}
            onCapture={() => pickImage("after")}
            onNext={submit}
            nextLabel="Verify with AI"
            nextTestID="submit-cleanup-button"
          />
        )}

        {step === "verifying" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.huge }}>
            <View style={[styles.pulse, { backgroundColor: t.brandSecondary }]}>
              <ActivityIndicator size="large" color={t.brand} />
            </View>
            <Txt variant="subtitle" weight="medium">Analyzing your cleanup…</Txt>
            <Txt color={t.onSurfaceSecondary} style={{ textAlign: "center" }}>
              Comparing before and after photos with Gemini vision AI.
            </Txt>
          </View>
        )}

        {step === "result" && result && (
          <View style={{ gap: spacing.lg, alignItems: "center" }}>
            <View style={[styles.resultBadge, { backgroundColor: result.verified ? t.brand : t.warning }]}>
              <Ionicons name={result.verified ? "checkmark" : "time"} size={44} color="#FFF" />
            </View>
            <Txt variant="title" weight="medium" testID="cleanup-result-title">
              {result.verified ? "Cleanup Verified!" : "Pending review"}
            </Txt>
            <Txt color={t.onSurfaceSecondary} style={{ textAlign: "center" }}>
              {result.ai_result?.reason}
            </Txt>
            <View style={[styles.pointsCard, { backgroundColor: t.brandSecondary }]}>
              <Ionicons name="flash" size={24} color={t.brand} />
              <Txt variant="title" weight="medium" color={t.onBrandSecondary}>+{result.points_awarded}</Txt>
              <Txt color={t.onBrandSecondary}>points earned</Txt>
            </View>
            {result.new_badges?.length > 0 && (
              <View style={{ gap: spacing.sm, alignItems: "center" }}>
                <Txt weight="medium">New badges unlocked!</Txt>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {result.new_badges.map((b: string) => (
                    <View key={b} style={[styles.miniBadge, { backgroundColor: t.brand }]}>
                      <Ionicons name="ribbon" size={16} color="#FFF" />
                      <Txt variant="small" weight="medium" color="#FFF">{b.replace(/_/g, " ")}</Txt>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <Button title="Done" testID="cleanup-done-button" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const t = useTheme();
  const idx = { intro: 0, before: 1, after: 2, verifying: 3, result: 4 }[step];
  const items = ["Intro", "Before", "After", "Verify", "Done"];
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {items.map((_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= idx ? t.brand : t.surfaceSecondary }} />
      ))}
    </View>
  );
}

function InstructionRow({ n, title, desc }: { n: number; title: string; desc: string }) {
  const t = useTheme();
  return (
    <View style={[styles.instRow, { backgroundColor: t.surfaceSecondary }]}>
      <View style={[styles.num, { backgroundColor: t.brand }]}>
        <Txt weight="medium" color="#FFF">{n}</Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="medium">{title}</Txt>
        <Txt variant="caption" color={t.onSurfaceSecondary}>{desc}</Txt>
      </View>
    </View>
  );
}

function PhotoStep({ title, subtitle, preview, onCapture, onNext, nextLabel = "Continue", nextTestID }: {
  title: string; subtitle: string; preview?: string; onCapture: () => void; onNext: () => void; nextLabel?: string; nextTestID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Txt variant="title" weight="medium">{title}</Txt>
      <Txt color={t.onSurfaceSecondary}>{subtitle}</Txt>
      <Pressable testID="photo-capture-area" onPress={onCapture} style={[styles.photoBox, { backgroundColor: t.surfaceSecondary, borderColor: t.border }]}>
        {preview ? (
          <Image source={{ uri: preview }} style={{ width: "100%", height: "100%", borderRadius: radius.lg }} contentFit="cover" />
        ) : (
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <Ionicons name="camera" size={40} color={t.brand} />
            <Txt weight="medium">Tap to capture</Txt>
            <Txt variant="caption" color={t.onSurfaceSecondary}>Camera or gallery</Txt>
          </View>
        )}
      </Pressable>
      <Button title={nextLabel} testID={nextTestID} disabled={!preview} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", padding: spacing.md, justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  metaCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  instRow: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, alignItems: "center" },
  num: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  photoBox: { height: 260, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pulse: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  resultBadge: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
  pointsCard: { padding: spacing.lg, borderRadius: radius.lg, alignItems: "center", gap: 4, width: "80%" },
  miniBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
});
