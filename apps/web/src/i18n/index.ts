import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ko from './locales/ko.json';

function syncDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language.split('-')[0] || 'en';
}

i18n.use(LanguageDetector).use(initReactI18next);
i18n.on('languageChanged', syncDocumentLanguage);

void i18n
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'bubbles_lang',
    },
  })
  .then(() => {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
  });

export default i18n;
