import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Txt } from "./Txt";
import { useTheme } from "../theme-context";
import { radius, spacing } from "../theme";

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  testID,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  testID?: string;
  multiline?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Txt variant="caption" color={t.onSurfaceSecondary}>{label}</Txt>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.onSurfaceTertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: t.surfaceSecondary,
            color: t.onSurface,
            borderColor: t.border,
            minHeight: multiline ? 96 : 52,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    borderWidth: 1,
  },
});
