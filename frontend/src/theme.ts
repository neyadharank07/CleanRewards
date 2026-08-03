import { StyleSheet } from "react-native";

export const palette = {
  surface: "#FFFFFF",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#3A3A3C",
  surfaceTertiary: "#E5E5EA",
  onSurfaceTertiary: "#8E8E93",
  brand: "#34C759",
  onBrand: "#FFFFFF",
  brandSecondary: "#E8F8EE",
  onBrandSecondary: "#248A3D",
  brandTertiary: "#D0F2DD",
  onBrandTertiary: "#1A6B2D",
  success: "#34C759",
  warning: "#FF9F0A",
  error: "#FF3B30",
  info: "#007AFF",
  border: "#E5E5EA",
  borderStrong: "#C7C7CC",
  divider: "#C6C6C8",
  dark: {
    surface: "#000000",
    onSurface: "#FFFFFF",
    surfaceSecondary: "#1C1C1E",
    onSurfaceSecondary: "#EBEBF5",
    surfaceTertiary: "#2C2C2E",
    onSurfaceTertiary: "#8E8E93",
    brand: "#30D158",
    onBrand: "#000000",
    brandSecondary: "#1A3B22",
    onBrandSecondary: "#30D158",
    brandTertiary: "#20502E",
    onBrandTertiary: "#4AE371",
    border: "#38383A",
    borderStrong: "#48484A",
    divider: "#38383A",
    warning: "#FF9F0A",
    error: "#FF453A",
    info: "#0A84FF",
  },
};

export type Theme = {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  brand: string;
  onBrand: string;
  brandSecondary: string;
  onBrandSecondary: string;
  brandTertiary: string;
  onBrandTertiary: string;
  border: string;
  borderStrong: string;
  divider: string;
  warning: string;
  error: string;
  info: string;
  isDark: boolean;
};

export function buildTheme(isDark: boolean): Theme {
  if (isDark) {
    return { ...palette.dark, isDark: true };
  }
  return {
    surface: palette.surface,
    onSurface: palette.onSurface,
    surfaceSecondary: palette.surfaceSecondary,
    onSurfaceSecondary: palette.onSurfaceSecondary,
    surfaceTertiary: palette.surfaceTertiary,
    onSurfaceTertiary: palette.onSurfaceTertiary,
    brand: palette.brand,
    onBrand: palette.onBrand,
    brandSecondary: palette.brandSecondary,
    onBrandSecondary: palette.onBrandSecondary,
    brandTertiary: palette.brandTertiary,
    onBrandTertiary: palette.onBrandTertiary,
    border: palette.border,
    borderStrong: palette.borderStrong,
    divider: palette.divider,
    warning: palette.warning,
    error: palette.error,
    info: palette.info,
    isDark: false,
  };
}

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 };

export const shadowCard = StyleSheet.create({
  s: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
}).s;
