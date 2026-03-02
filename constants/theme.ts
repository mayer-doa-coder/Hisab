/**
 * HISAB Design System — "Autumn Leaves" palette
 *
 * Palette source: #FFB343 · #DB9A39 · #B37E2E · #614419
 *
 * Sections:
 *  - Palette        raw colour values
 *  - Colors         semantic light/dark tokens consumed by components
 *  - Spacing        4-point scale (xs=4 … xxl=48)
 *  - FontSize       typographic scale (caption=12 … display=32)
 *  - FontFamily     Bengali + system stacks
 *  - FontWeight     named weight constants
 *  - BorderRadius   sm=4 … full=9999
 *  - Shadow         sm / md elevation helpers
 */

import { Platform } from "react-native";

// ── Raw palette ─────────────────────────────────────────────────────────────
export const Palette = {
  // Brand — Autumn Leaves
  primary: "#FFB343", // bright golden amber
  secondary: "#DB9A39", // mid amber
  accent: "#B37E2E", // dark gold
  dark: "#614419", // deep brown

  // Semantic
  success: "#27AE60",
  danger: "#E74C3C",
  warning: "#F39C12",
  info: "#2980B9",

  // Neutrals
  white: "#FFFFFF",
  offWhite: "#FFF8EE", // warm tinted background
  grey100: "#F5F5F5",
  grey200: "#E0E0E0",
  grey400: "#9E9E9E",
  grey600: "#616161",
  grey800: "#212121",
  black: "#000000",
} as const;

// ── Semantic colour tokens ───────────────────────────────────────────────────
export const Colors = {
  light: {
    text: Palette.grey800,
    textSecondary: Palette.grey600,
    background: Palette.offWhite,
    card: Palette.white,
    tint: Palette.primary,
    icon: Palette.grey400,
    tabIconDefault: Palette.grey400,
    tabIconSelected: Palette.primary,
    border: Palette.grey200,
    inputBg: Palette.white,
    headerBg: Palette.dark,
    headerText: Palette.white,
    success: Palette.success,
    danger: Palette.danger,
    warning: Palette.warning,
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: Palette.grey400,
    background: "#1A1008",
    card: "#2C1F0F",
    tint: Palette.primary,
    icon: Palette.grey400,
    tabIconDefault: Palette.grey400,
    tabIconSelected: Palette.primary,
    border: "#3D2D18",
    inputBg: "#2C1F0F",
    headerBg: Palette.dark,
    headerText: Palette.white,
    success: "#2ECC71",
    danger: "#E57373",
    warning: "#FFB74D",
  },
} as const;

// ── 4-point spacing scale ────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ── Typographic scale ────────────────────────────────────────────────────────
export const FontSize = {
  caption: 12,
  body: 14,
  bodyLarge: 16,
  titleSmall: 18,
  titleMedium: 20,
  titleLarge: 24,
  display: 32,
} as const;

// ── Font families ────────────────────────────────────────────────────────────
export const FontFamily = {
  /** Bengali script — loaded via expo-font in _layout.tsx */
  bengali: "NotoBengali",
  /** System sans-serif stack for Latin / numeric content */
  ...Platform.select({
    ios: {
      sans: "System",
      mono: "Menlo",
    },
    android: {
      sans: "Roboto",
      mono: "monospace",
    },
    default: {
      sans: "System",
      mono: "monospace",
    },
  }),
} as const;

// ── Font weights ─────────────────────────────────────────────────────────────
export const FontWeight = {
  regular: "400" as const,
  medium: "500" as const,
  semiBold: "600" as const,
  bold: "700" as const,
} as const;

// ── Border radii ─────────────────────────────────────────────────────────────
export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

// ── Shadows / elevation ──────────────────────────────────────────────────────
// Uses the unified `boxShadow` prop (RN 0.76+) instead of the deprecated
// shadow* / elevation family, which is cross-platform and web-compatible.
export const Shadow = {
  sm: { boxShadow: "0px 1px 2px rgba(0,0,0,0.08)" },
  md: { boxShadow: "0px 2px 4px rgba(0,0,0,0.12)" },
} as const;
