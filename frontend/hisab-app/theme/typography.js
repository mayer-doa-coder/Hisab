import { Platform } from 'react-native';

const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui',
});

export const TYPOGRAPHY = {
  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
  },
  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  subheading: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  small: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  button: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
};
