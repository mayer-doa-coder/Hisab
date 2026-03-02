/**
 * HISAB Typography System
 *
 * Exports strongly-typed <Text> wrapper components for every
 * scale level in the type ramp.  All components accept the standard
 * React Native Text props (color, style, numberOfLines, etc.).
 *
 * Scale:
 *  TitleLarge   — 24 px bold  (screen headings)
 *  TitleMedium  — 20 px semi-bold  (section headings)
 *  BodyText     — 14 px regular  (body / list content)
 *  Caption      — 12 px regular  (metadata, hints)
 *
 * Bengali variants:
 *  BengaliTitle  — TitleLarge with NotoBengali font
 *  BengaliBody   — BodyText with NotoBengali font
 */

import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import {
    FontFamily,
    FontSize,
    FontWeight,
    Palette,
} from "../../constants/theme";

// ── Helpers ──────────────────────────────────────────────────────────────────

type TypographyProps = TextProps & { children: React.ReactNode };

// ── Latin / system-font scale ─────────────────────────────────────────────────

/** 24 px bold — use for screen titles */
export const TitleLarge: React.FC<TypographyProps> = ({ style, ...props }) => (
  <Text style={[t.titleLarge, style]} {...props} />
);

/** 20 px semi-bold — use for section headers */
export const TitleMedium: React.FC<TypographyProps> = ({ style, ...props }) => (
  <Text style={[t.titleMedium, style]} {...props} />
);

/** 14 px regular — use for body content and list rows */
export const BodyText: React.FC<TypographyProps> = ({ style, ...props }) => (
  <Text style={[t.body, style]} {...props} />
);

/** 12 px regular — use for hints, timestamps, secondary metadata */
export const Caption: React.FC<TypographyProps> = ({ style, ...props }) => (
  <Text style={[t.caption, style]} {...props} />
);

// ── Bengali variants ──────────────────────────────────────────────────────────

/** 24 px bold in NotoBengali — screen headings in Bengali */
export const BengaliTitle: React.FC<TypographyProps> = ({
  style,
  ...props
}) => <Text style={[t.titleLarge, t.bengali, style]} {...props} />;

/** 16 px regular in NotoBengali — body content in Bengali */
export const BengaliBody: React.FC<TypographyProps> = ({ style, ...props }) => (
  <Text style={[t.bodyLarge, t.bengali, style]} {...props} />
);

/** 12 px regular in NotoBengali — captions in Bengali */
export const BengaliCaption: React.FC<TypographyProps> = ({
  style,
  ...props
}) => <Text style={[t.caption, t.bengali, style]} {...props} />;

// ── Styles ────────────────────────────────────────────────────────────────────

const t = StyleSheet.create({
  titleLarge: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.titleLarge, // 24
    fontWeight: FontWeight.bold,
    color: Palette.grey800,
    letterSpacing: 0.15,
  },
  titleMedium: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.titleMedium, // 20
    fontWeight: FontWeight.semiBold,
    color: Palette.grey800,
    letterSpacing: 0.1,
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.body, // 14
    fontWeight: FontWeight.regular,
    color: Palette.grey800,
    lineHeight: 20,
  },
  bodyLarge: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.bodyLarge, // 16
    fontWeight: FontWeight.regular,
    color: Palette.grey800,
    lineHeight: 24,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.caption, // 12
    fontWeight: FontWeight.regular,
    color: Palette.grey600,
    lineHeight: 16,
  },
  bengali: {
    fontFamily: FontFamily.bengali, // 'NotoBengali'
  },
});
