import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';
import vi from './locales/vi.json';
import id from './locales/id.json';

const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  ru: { translation: ru },
  zh: { translation: zh },
  vi: { translation: vi },
  id: { translation: id },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'fr', 'ru', 'zh', 'vi', 'id'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    debug: false,
  });

export default i18n;
