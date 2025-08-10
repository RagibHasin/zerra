import i18n from 'i18next';
import cookie from 'js-cookie';
import { initReactI18next } from 'react-i18next';

import bnTranslations from './i18n/bn.json';
import enTranslations from './i18n/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'en';
    resources: {
      bn: typeof bnTranslations;
      en: typeof enTranslations;
    };
  }
}

const resources = {
  en: { translation: enTranslations },
  bn: { translation: bnTranslations },
};

// eslint-disable-next-line import/no-named-as-default-member
await i18n
  .use(initReactI18next)
  .use({ type: 'languageDetector', detect: () => cookie.get('lang') ?? 'en' })
  .init({
    resources,
    interpolation: { escapeValue: false },
  });

export default i18n;
