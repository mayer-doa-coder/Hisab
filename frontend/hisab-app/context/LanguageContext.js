import * as FileSystem from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import bn from '../locales/bn';
import en from '../locales/en';
import { setRuntimeLanguage, toLocalizedUiText } from '../utils/bilingualText';
import {
  formatCurrency,
  formatCurrencyShort,
  formatDate,
  formatDueStatus,
  formatNumber,
  formatPercent,
  formatRelativeDate,
  toBengaliDigits,
} from '../utils/numerals';

const DICTIONARIES = { en, bn };
const DEFAULT_LANGUAGE = 'bn';
const LANG_FILE = `${FileSystem.documentDirectory}hisab_lang.json`;

const LanguageContext = createContext(null);

const readLangPref = async () => {
  try {
    const info = await FileSystem.getInfoAsync(LANG_FILE);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(LANG_FILE);
      const { language } = JSON.parse(raw);
      if (language === 'en' || language === 'bn') return language;
    }
  } catch {}
  return DEFAULT_LANGUAGE;
};

const saveLangPref = async (language) => {
  try {
    await FileSystem.writeAsStringAsync(LANG_FILE, JSON.stringify({ language }));
  } catch {}
};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    readLangPref().then(setLanguageState);
  }, []);

  useEffect(() => {
    setRuntimeLanguage(language);
  }, [language]);

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    await saveLangPref(lang);
  }, []);

  // ── t(): translate a string key with optional variable interpolation ────────
  const t = useCallback(
    (key, vars = {}) => {
      const dict = DICTIONARIES[language] || bn;
      let str = dict[key];
      if (str === undefined) str = en[key];
      if (str === undefined) return key;
      if (!vars || Object.keys(vars).length === 0) return str;
      // Replace {var} placeholders; numeric values auto-convert to Bengali digits
      return Object.entries(vars).reduce((s, [k, v]) => {
        const display =
          language === 'bn' && typeof v === 'number'
            ? toBengaliDigits(String(v))
            : String(v);
        return s.replace(`{${k}}`, display);
      }, str);
    },
    [language]
  );

  // ── mapText(): translate inline Bengali text for legacy/bilingual content ───
  const mapText = useCallback(
    (text) => toLocalizedUiText(text, language),
    [language]
  );

  // ── Locale-aware formatters ─────────────────────────────────────────────────
  // These are pre-bound to the active language so screens never need to pass it.

  const fmtNumber = useCallback(
    (value, decimals = 0) => formatNumber(value, language, decimals),
    [language]
  );

  const fmtCurrency = useCallback(
    (value, decimals = 2) => formatCurrency(value, language, decimals),
    [language]
  );

  const fmtCurrencyShort = useCallback(
    (value) => formatCurrencyShort(value, language),
    [language]
  );

  const fmtDate = useCallback(
    (date, style = 'short') => formatDate(date, language, style),
    [language]
  );

  const fmtRelativeDate = useCallback(
    (date) => formatRelativeDate(date, language),
    [language]
  );

  const fmtDueStatus = useCallback(
    (dueDate) => formatDueStatus(dueDate, language),
    [language]
  );

  const fmtPercent = useCallback(
    (ratio, decimals = 1) => formatPercent(ratio, language, decimals),
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      isBn: language === 'bn',
      // Translation
      t,
      mapText,
      // Locale-aware formatters
      fmtNumber,
      fmtCurrency,
      fmtCurrencyShort,
      fmtDate,
      fmtRelativeDate,
      fmtDueStatus,
      fmtPercent,
    }),
    [
      language,
      setLanguage,
      t,
      mapText,
      fmtNumber,
      fmtCurrency,
      fmtCurrencyShort,
      fmtDate,
      fmtRelativeDate,
      fmtDueStatus,
      fmtPercent,
    ]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
