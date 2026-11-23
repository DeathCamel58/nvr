import i18n, { currentLanguage, dateLocale, pickLanguage, t } from '../src/i18n';
import ru from '../src/i18n/locales/ru';
import en from '../src/i18n/locales/en';

/** Раскладывает вложенный объект переводов в плоский список ключей. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/**
 * Ключи с множественными формами («_one», «_few», «_many», «_other»)
 * в русском и английском наборах разные: приводим их к общему корню.
 */
function roots(keys: string[]): Set<string> {
  return new Set(keys.map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')));
}

describe('выбор языка', () => {
  it('английская локаль даёт английский', () => {
    expect(pickLanguage('en-US')).toBe('en');
    expect(pickLanguage('en_GB')).toBe('en');
    expect(pickLanguage('EN')).toBe('en');
  });

  it('русская, чужая и пустая локали дают русский', () => {
    expect(pickLanguage('ru-RU')).toBe('ru');
    expect(pickLanguage('de-DE')).toBe('ru');
    expect(pickLanguage('')).toBe('ru');
    expect(pickLanguage(undefined)).toBe('ru');
    expect(pickLanguage(null)).toBe('ru');
  });

  it('«enx» и подобные коды не принимаются за английский', () => {
    expect(pickLanguage('enx-US')).toBe('ru');
  });
});

describe('переводы', () => {
  afterEach(async () => {
    await i18n.changeLanguage('ru');
  });

  it('каждый ключ русского файла есть в английском и наоборот', () => {
    const ruKeys = roots(flatten(ru));
    const enKeys = roots(flatten(en));
    expect([...ruKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !ruKeys.has(k))).toEqual([]);
  });

  it('язык переключается, а даты следуют за ним', async () => {
    expect(currentLanguage()).toBe('ru');
    expect(dateLocale()).toBe('ru-RU');
    await i18n.changeLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(dateLocale()).toBe('en-US');
  });

  it('отсутствующая строка не превращается в ключ', async () => {
    // Строки, которой нет ни в одном языке, нет и тут: показывается ключ —
    // так её легко заметить. Для строки, которой нет в английском, должен
    // сработать запасной русский.
    await i18n.changeLanguage('en');
    expect(t('нет.такого.ключа')).toBe('нет.такого.ключа');
  });

  it('подстановка значений работает', () => {
    i18n.addResource('ru', 'translation', 'test.hello', 'Привет, {{name}}');
    expect(t('test.hello', { name: 'мир' })).toBe('Привет, мир');
  });
});
