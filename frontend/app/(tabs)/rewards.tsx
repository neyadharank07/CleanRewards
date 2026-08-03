import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { api, Reward } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { Button } from "@/src/components/Button";
import { useToast } from "@/src/components/Toast";
import { radius, spacing, shadowCard } from "@/src/theme";

const REWARD_IMAGES: Record<string, string> = {
  coffee:
    "https://images.unsplash.com/photo-1507133750040-4a8f57021571?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxsYXR0ZSUyMGFydCUyMGNvZmZlZSUyMHNob3B8ZW58MHx8fHwxNzg1Nzc0ODk3fDA&ixlib=rb-4.1.0&q=85",
  movie: "https://images.pexels.com/photos/7234386/pexels-photo-7234386.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  park:
    "https://images.unsplash.com/photo-1592859600972-1b0834d83747?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwxfHxmb3Jlc3QlMjBuYXR1cmUlMjB0cmFpbHxlbnwwfHx8fDE3ODI5ODQwNzV8MA&ixlib=rb-4.1.0&q=85",
  drink:
    "https://images.unsplash.com/photo-1585328000852-779be6a6582b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwxfHxlY28lMjBmcmllbmRseSUyMGdyZWVuJTIwbGVhZnxlbnwwfHx8fDE3ODU3NzQ5MTF8MA&ixlib=rb-4.1.0&q=85",
};

export default function RewardsScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const { show } = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.rewards();
      setRewards(r);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const points = user?.points ?? 0;
  const nextReward = [...rewards].sort((a, b) => a.cost - b.cost).find((r) => r.cost > points);
  const progress = nextReward ? Math.min(1, points / nextReward.cost) : 1;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Txt variant="title" weight="medium">Rewards</Txt>
        <View style={[styles.balanceCard, { backgroundColor: t.brand }]}>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color="rgba(255,255,255,0.85)">YOUR BALANCE</Txt>
            <Txt variant="display" weight="medium" color="#FFF" testID="rewards-balance">{points}</Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.85)">points earned</Txt>
          </View>
          <Ionicons name="gift" size={48} color="#FFFFFF" style={{ opacity: 0.7 }} />
        </View>
        {nextReward && (
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="caption" color={t.onSurfaceSecondary}>Next: {nextReward.title}</Txt>
              <Txt variant="caption" color={t.onSurfaceSecondary}>{points} / {nextReward.cost}</Txt>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: t.surfaceSecondary }]}>
              <View style={[styles.progressFill, { backgroundColor: t.brand, width: `${progress * 100}%` }]} />
            </View>
          </View>
        )}
      </View>

      <FlatList
        data={rewards}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: 140 }}
        renderItem={({ item }) => {
          const canRedeem = points >= item.cost;
          return (
            <View testID={`reward-${item.id}`} style={[styles.card, shadowCard, { backgroundColor: t.surfaceSecondary }]}>
              <Image source={{ uri: REWARD_IMAGES[item.image] || REWARD_IMAGES.coffee }} style={styles.rewardImg} contentFit="cover" />
              <View style={{ padding: spacing.md, gap: spacing.xs }}>
                <Txt weight="medium" numberOfLines={2}>{item.title}</Txt>
                <Txt variant="small" color={t.onSurfaceSecondary} numberOfLines={2}>{item.description}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="flash" size={14} color={t.brand} />
                  <Txt weight="medium" color={t.brand}>{item.cost}</Txt>
                </View>
                <Button
                  title={canRedeem ? "Redeem" : "Locked"}
                  variant={canRedeem ? "primary" : "secondary"}
                  disabled={!canRedeem}
                  onPress={() => show(canRedeem ? "Redemption coming soon!" : "Not enough points yet", canRedeem ? "success" : "info")}
                  testID={`redeem-${item.id}`}
                  style={{ marginTop: spacing.xs, minHeight: 40 }}
                />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  balanceCard: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, gap: spacing.md },
  progressTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: radius.pill },
  card: { flex: 1, borderRadius: radius.lg, overflow: "hidden" },
  rewardImg: { width: "100%", height: 110 },
});
