import * as FileSystem from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import bn from '../locales/bn';
import en from '../locales/en';
import { setRuntimeLanguage, toLocalizedUiText } from '../utils/bilingualText';

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

  const t = useCallback(
    (key, vars = {}) => {
      const dict = DICTIONARIES[language] || bn;
      let str = dict[key];
      if (str === undefined) str = en[key];
      if (str === undefined) return key;
      if (!vars || Object.keys(vars).length === 0) return str;
      return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), str);
    },
    [language]
  );

  const mapText = useCallback(
    (text) => toLocalizedUiText(text, language),
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t, mapText }), [language, setLanguage, t, mapText]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
