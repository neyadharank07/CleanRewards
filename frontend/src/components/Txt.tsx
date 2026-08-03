import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { useTheme } from "../theme-context";

type Weight = "regular" | "medium";
type Variant = "display" | "title" | "subtitle" | "body" | "caption" | "small";

const sizes: Record<Variant, { fs: number; lh: number }> = {
  display: { fs: 34, lh: 40 },
  title: { fs: 24, lh: 30 },
  subtitle: { fs: 20, lh: 26 },
  body: { fs: 16, lh: 22 },
  caption: { fs: 14, lh: 20 },
  small: { fs: 12, lh: 16 },
};

export function Txt({
  variant = "body",
  weight = "regular",
  color,
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant; weight?: Weight; color?: string }) {
  const t = useTheme();
  const s = sizes[variant];
  return (
    <Text
      {...rest}
      style={[
        {
          color: color || t.onSurface,
          fontSize: s.fs,
          lineHeight: s.lh,
          fontWeight: weight === "medium" ? "600" : "400",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export const _s = StyleSheet.create({});
