/**
 * Перевод интерфейса.
 *
 * Язык берётся из настроек телефона: если он английский — английский,
 * иначе русский. Русский же запасной язык: строка, которой нет в английском
 * файле, показывается по-русски, а не ключом вроде «login.title». Поэтому
 * экраны можно переводить по одному, не останавливая работу.
 *
 * Переводы лежат в коде, а не загружаются из сети: сервер видеонаблюдения
 * часто стоит в сети без выхода наружу.
 *
 * Файлы языков разбиты по группам (один экран или модуль — одна группа):
 * так правки разных экранов не конфликтуют. Ключ строится как
 * «группа.ключ», например t('login.title').
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { installPluralRulesFallback } from './pluralRules';
import ru from './locales/ru';
import en from './locales/en';

export const LANGUAGES = ['ru', 'en'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

/** Язык по умолчанию и запасной: на нём написано приложение. */
export const DEFAULT_LANGUAGE: LanguageCode = 'ru';

/**
 * Выбирает язык по коду локали телефона («en-US», «ru-RU», «de-DE» …).
 *
 * Неизвестный или пустой код даёт русский: так приложение вело себя до
 * появления переводов.
 */
export function pickLanguage(tag: string | null | undefined): LanguageCode {
  const lower = (tag ?? '').toLowerCase();
  if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) {
    return 'en';
  }
  return DEFAULT_LANGUAGE;
}

/** Код локали телефона; пустая строка, если узнать его не удалось. */
function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  } catch {
    // Движок без Intl: работаем на языке по умолчанию.
    return '';
  }
}

// Hermes без Intl.PluralRules: формы «запись/записи/записей» ломаются.
installPluralRulesFallback();

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: pickLanguage(deviceLocale()),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  // Строки готовы сразу, без асинхронной загрузки: иначе первый кадр
  // показал бы ключи.
  initAsync: false,
  interpolation: {
    // Экранировать не нужно: React Native выводит текст как есть.
    escapeValue: false,
  },
});

/** Перевод вне компонентов: сетевой слой, SIP, уведомления. */
export const t = i18n.t.bind(i18n);

/** Текущий язык интерфейса. */
export function currentLanguage(): LanguageCode {
  return pickLanguage(i18n.language);
}

/**
 * Локаль для дат и чисел («toLocaleString»), согласованная с языком
 * интерфейса: английский текст с русской датой выглядел бы разнобоем.
 */
export function dateLocale(): string {
  return currentLanguage() === 'en' ? 'en-US' : 'ru-RU';
}

export default i18n;
