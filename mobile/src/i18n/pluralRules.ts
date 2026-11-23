/**
 * Запасной Intl.PluralRules для русского и английского.
 *
 * i18next выбирает форму слова («1 запись», «2 записи», «5 записей»)
 * через Intl.PluralRules, а Hermes на телефоне его не содержит: без него
 * любое число, кроме 1, получило бы форму «other». Node в тестах Intl
 * поддерживает полностью, поэтому такую ошибку тесты сами не поймали бы.
 *
 * Здесь только то, что нужно приложению: числительные (cardinal) для ru
 * и en. Новый язык с несколькими формами добавляют в RULES.
 */

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

interface Rule {
  select: (n: number) => Category;
  categories: Category[];
}

const RULES: Record<string, Rule> = {
  ru: {
    select: (n) => {
      if (!Number.isInteger(n)) return 'other';
      const mod10 = Math.abs(n) % 10;
      const mod100 = Math.abs(n) % 100;
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    },
    categories: ['few', 'many', 'one', 'other'],
  },
  en: {
    select: (n) => (n === 1 ? 'one' : 'other'),
    categories: ['one', 'other'],
  },
};

/** Язык без правил получает одну форму: так ведёт себя и сам i18next. */
const FALLBACK: Rule = { select: () => 'other', categories: ['other'] };

class PluralRulesFallback {
  private readonly rule: Rule;
  private readonly locale: string;
  private readonly type: 'cardinal' | 'ordinal';

  constructor(locales?: string | string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    const tag = (Array.isArray(locales) ? locales[0] : locales) ?? 'en';
    this.locale = tag;
    this.type = options?.type ?? 'cardinal';
    const lang = tag.toLowerCase().split(/[-_]/)[0];
    // Порядковые числительные (ordinal) приложению не нужны.
    this.rule = this.type === 'ordinal' ? FALLBACK : (RULES[lang] ?? FALLBACK);
  }

  select(n: number): Category {
    return this.rule.select(Number(n));
  }

  resolvedOptions() {
    return {
      locale: this.locale,
      type: this.type,
      pluralCategories: [...this.rule.categories],
    };
  }

  static supportedLocalesOf(locales?: string | string[]): string[] {
    const list = Array.isArray(locales) ? locales : locales ? [locales] : [];
    return list.filter((tag) => tag.toLowerCase().split(/[-_]/)[0] in RULES);
  }
}

/**
 * Ставит запасную реализацию, если движок своей не даёт.
 *
 * Вызывать нужно до i18n.init: i18next проверяет Intl.PluralRules при
 * создании правил. При force подменяет и настоящую реализацию (для теста).
 */
export function installPluralRulesFallback(force = false): void {
  if (typeof Intl === 'undefined') return;
  if (!force && typeof Intl.PluralRules === 'function') return;
  Object.defineProperty(Intl, 'PluralRules', {
    value: PluralRulesFallback,
    writable: true,
    configurable: true,
  });
}
