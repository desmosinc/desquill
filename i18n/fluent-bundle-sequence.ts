import * as FluentBundle from '@fluent/bundle';

import {
  isLocalizableNumericValue,
  type LocalizableNumericValue
} from './localizable-numeric-value.ts';

// From https://github.com/shadiabuhilal/rtl-detect/blob/2eed8a33276461a24e7033d1d3a115ee64aee3f5/lib/rtl-detect.js
const RTL_LANGUAGES = [
  'ae' /* Avestan */,
  'ar' /* 'العربية', Arabic */,
  'arc' /* Aramaic */,
  'bcc' /* 'بلوچی مکرانی', Southern Balochi */,
  'bqi' /* 'بختياري', Bakthiari */,
  'ckb' /* 'Soranî / کوردی', Sorani */,
  'dv' /* Dhivehi */,
  'fa' /* 'فارسی', Persian */,
  'glk' /* 'گیلکی', Gilaki */,
  'he' /* 'עברית', Hebrew */,
  'ku' /* 'Kurdî / كوردی', Kurdish */,
  'mzn' /* 'مازِرونی', Mazanderani */,
  'nqo' /* N'Ko */,
  'pnb' /* 'پنجابی', Western Punjabi */,
  'ps' /* 'پښتو', Pashto, */,
  'sd' /* 'سنڌي', Sindhi */,
  'ug' /* 'Uyghurche / ئۇيغۇرچە', Uyghur */,
  'ur' /* 'اردو', Urdu */,
  'yi' /* 'ייִדיש', Yiddish */
];

export type FluentBundleSequenceOptions = {
  transform?: (s: string) => string;
};

/**
 * Interface to an sequence of Fluent bundles, in order of language preference.
 */
export class FluentBundleSequence<TranslatedString extends string> {
  declare private bundles: FluentBundle.FluentBundle[];
  declare private onError: (err: string | Error) => void;

  constructor(
    bundles: FluentBundle.FluentBundle[],
    onError: (err: string | Error) => void
  ) {
    this.bundles = bundles;
    this.onError = onError;
  }

  /**
   * Create a `FluentBundleSequence` from raw .ftl sources.
   * @param ftlSources Array of raw .ftl source text (with associated locale code)
   */
  static fromSources(
    ftlSources: { source: string; lang: string }[],
    onError: (err: string | Error) => void,
    options: FluentBundleSequenceOptions
  ) {
    const bundles: FluentBundle.FluentBundle[] = [];
    for (const { lang, source } of ftlSources) {
      const baseLang = lang.split('-')[0];
      const bundle = new FluentBundle.FluentBundle(lang, {
        ...options,
        // Use unicode isolation markers for RTL languages, but not for LTR ones. These isolation characters serve as
        // a hint to the Unicode BiDi text rendering algorithm when LTR text is embedded within RTL text or vice versa.
        // These marks are audible in screen reader narration, so we only include them in RTL text where they're much
        // more likely to make a difference, since most of our interpolated content is likely to be LTR.
        // See https://github.com/projectfluent/fluent.js/wiki/Unicode-Isolation for background.
        useIsolating: RTL_LANGUAGES.indexOf(baseLang) >= 0
      });
      bundle.addResource(new FluentBundle.FluentResource(source), {
        allowOverrides: false
      });

      // Add common datetime formatting messages
      bundle.addResource(
        new FluentBundle.FluentResource(`
l10n-internal-date-day-month-year = {DATETIME($d, month: "short", day: "numeric", year: "numeric")}
l10n-internal-date-day-month = {DATETIME($d, month: "short", day: "numeric")}
l10n-internal-time = {DATETIME($d, minute: "numeric", hour: "numeric")}
      `),
        { allowOverrides: false }
      );

      bundles.push(bundle);
    }
    return new FluentBundleSequence(bundles, onError);
  }

  /**
   * Format the string with the given key,
   */
  format(
    key: string,
    variables: { [name: string]: FluentBundle.FluentVariable }
  ): TranslatedString | undefined {
    for (const bundle of this.bundles) {
      if (!bundle.hasMessage(key)) continue;
      const message = bundle.getMessage(key);
      if (!message?.value) {
        return undefined;
      }
      const errors: Error[] = [];
      const result = bundle.formatPattern(
        message.value,
        this.coerceNumericVariables(variables),
        errors
      ) as TranslatedString;
      for (const error of errors) {
        this.onError(
          `Error formatting ${key} for locale ${bundle.locales.join(
            ','
          )}: ${error}`
        );
      }
      return result;
    }

    this.onError(
      `Couldn't find message for key ${key} for locales ${this.getLocales().join(
        ','
      )}`
    );
    return undefined;
  }

  /**
   * Format the given Date as a date in a locale-appropriate form analogous to "Jul 7, 2020"
   */
  formatDate(
    date: Date,
    options: {
      showYear: boolean;
    }
  ): TranslatedString {
    return options.showYear
      ? (this.format('l10n-internal-date-day-month-year', {
          d: date
        }) as TranslatedString)
      : (this.format('l10n-internal-date-day-month', {
          d: date
        }) as TranslatedString);
  }

  /**
   * Format the given Date as a time in a locale-appropriate form analogous to "1:30 PM"
   */
  formatTime(date: Date): TranslatedString {
    const formatted = this.format('l10n-internal-time', { d: date });
    if (this.getLocales()[0] === 'en') {
      return formatted?.toLowerCase() as TranslatedString;
    }
    return formatted as TranslatedString;
  }

  hasTranslation(key: string, locale: string) {
    for (const bundle of this.bundles) {
      if (bundle.locales.indexOf(locale) >= 0) {
        return bundle.hasMessage(key);
      }
    }
    return false;
  }

  /**
   * Coerce any numeric variables values to strings so that Fluent doesn't automatically format them with
   * locale-specific grouping, fractional digit limits, etc.  We can still use those formatting features
   * by explicitly using the built-in NUMBER function in our Fluent strings.  See:
   * https://www.projectfluent.org/fluent/guide/functions.html
   */
  private coerceNumericVariables(variables: {
    [name: string]: FluentBundle.FluentVariable | LocalizableNumericValue;
  }): { [name: string]: FluentBundle.FluentVariable } {
    const out: {
      [name: string]: FluentBundle.FluentVariable;
    } = {};
    for (const k in variables) {
      const val = variables[k];
      if (isLocalizableNumericValue(val)) {
        out[k] = val.value;
      } else if (typeof val === 'number') {
        out[k] = `${val}`;
      } else {
        out[k] = val;
      }
    }
    return out;
  }

  private getLocales() {
    return this.bundles.reduce(
      (memo, b) => memo.concat(b.locales),
      [] as string[]
    );
  }
}
