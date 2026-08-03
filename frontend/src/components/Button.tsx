import React from "react";
import { Pressable, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Txt } from "./Txt";
import { useTheme } from "../theme-context";
import { radius } from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? t.brand
      : variant === "secondary" ? t.brandSecondary
      : variant === "danger" ? t.error
      : "transparent";
  const fg =
    variant === "primary" ? t.onBrand
      : variant === "secondary" ? t.onBrandSecondary
      : variant === "danger" ? "#FFFFFF"
      : t.onSurface;
  const border = variant === "ghost" ? t.border : "transparent";
  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={() => {
        if (isDisabled) return;
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "ghost" ? 1 : 0, opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Txt weight="medium" color={fg}>{title}</Txt>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
});
