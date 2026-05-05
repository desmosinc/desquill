import {
  type DictionaryKey,
  type KeysWithNoVariables,
  type KeyToVariables
} from './dictionary-types-generated';

/**
 * By default, we coerce all numeric variables to strings before passing them in for interpolation, so that Fluent doesn't
 * automatically format them in a locale-specific way (see `coerceNumericVariables` below).  Use this wrapper when you
 * want to opt out of the string coercion, e.g. so that Fluent can format it for you or use it for selecting a plural
 * variant.
 */
interface LocalizableNumericValue {
  readonly __isLocalizableNumericValue: true;
  readonly value: number;
}

export interface PackedTranslation {
  key: DictionaryKey;
  vars?: Vars | undefined;
}

type VariableValue = string | number | LocalizableNumericValue;

export function localizableNumericValue(
  value: number
): LocalizableNumericValue {
  return { __isLocalizableNumericValue: true, value };
}

export type Vars = {
  [lang: string]: VariableValue | undefined;
};

type KeysWithVariables = keyof KeyToVariables<unknown>;
type Variables<K extends KeysWithVariables> = KeyToVariables<VariableValue>[K];

export interface LocalizeFunction {
  (k: KeysWithNoVariables, variables?: undefined): string;
  <K extends KeysWithVariables>(key: K, variables: Variables<K>): string;
  // Side-channel for ordinal-driven Fluent selectors.  See the corresponding comment on
  // `LookupWithLanguageBinding` in `lib/i18n-core.ts` — `@fluent/bundle` 0.19 doesn't honor
  // `type: "ordinal"` in NUMBER(), so callers compute the CLDR ordinal category and pass it
  // as a string variable.
  ordinalCategory(value: number): Intl.LDMLPluralRule;
}
