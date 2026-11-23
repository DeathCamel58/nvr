import { createInstance } from 'i18next';

import { installPluralRulesFallback } from '../src/i18n/pluralRules';
import ru from '../src/i18n/locales/ru';
import en from '../src/i18n/locales/en';

/**
 * Hermes на телефоне не содержит Intl.PluralRules, а Node содержит, так
 * что без подмены этот сбой тесты не видят. Здесь настоящую реализацию
 * подменяют запасной и проверяют формы слов на целой шкале чисел.
 */

const realPluralRules = Intl.PluralRules;

beforeAll(() => installPluralRulesFallback(true));
afterAll(() => {
  Object.defineProperty(Intl, 'PluralRules', {
    value: realPluralRules,
    writable: true,
    configurable: true,
  });
});

async function translator(lng: 'ru' | 'en') {
  const instance = createInstance();
  await instance.init({
    resources: { ru: { translation: ru }, en: { translation: en } },
    lng,
    fallbackLng: 'ru',
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance.t.bind(instance);
}

describe('формы слов без Intl.PluralRules движка', () => {
  it('подмена действительно стоит', () => {
    expect(Intl.PluralRules).not.toBe(realPluralRules);
  });

  it('русский: запись, записи, записей', async () => {
    const t = await translator('ru');
    const word = (n: number) => t('archive.recordCount', { count: n }).replace(`${n} `, '');
    const cases: Array<[number, string]> = [
      [0, word(5)],
      [1, word(21)],
      [2, word(22)],
      [4, word(24)],
      [5, word(5)],
      [11, word(5)],
      [12, word(5)],
      [14, word(5)],
      [21, word(21)],
      [22, word(2)],
      [101, word(1)],
      [111, word(5)],
    ];
    // Формы разные: иначе сравнение выше ничего не доказывает.
    expect(new Set([word(1), word(2), word(5)]).size).toBe(3);
    for (const [n, expected] of cases) {
      expect(word(n)).toBe(expected);
    }
  });

  it('русский: те же формы для журнала вызовов', async () => {
    const t = await translator('ru');
    expect(t('missed.subtitleCount', { count: 1 })).toContain('вызов в');
    expect(t('missed.subtitleCount', { count: 3 })).toContain('вызова в');
    expect(t('missed.subtitleCount', { count: 5 })).toContain('вызовов в');
  });

  it('английский: единственное и множественное число', async () => {
    const t = await translator('en');
    expect(t('archive.recordCount', { count: 1 })).toBe('1 recording');
    expect(t('archive.recordCount', { count: 5 })).toBe('5 recordings');
    expect(t('archive.recordCount', { count: 0 })).toBe('0 recordings');
  });
});
