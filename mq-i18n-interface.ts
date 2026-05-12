import {
  type DictionaryKey,
  type KeysWithNoVariables,
  type KeyToVariables
} from './dictionary-types-generated';
import type { LocalizableNumericValue } from './i18n/localizable-numeric-value';

export interface PackedTranslation {
  key: DictionaryKey;
  vars?: Vars | undefined;
}

type VariableValue = string | number | LocalizableNumericValue;

export type Vars = {
  [lang: string]: VariableValue | undefined;
};

export type KeysWithVariables = keyof KeyToVariables<unknown>;
export type Variables<K extends KeysWithVariables> =
  KeyToVariables<VariableValue>[K];

export interface LocalizeFunction {
  (k: KeysWithNoVariables, variables: undefined, language: string): string;
  <K extends KeysWithVariables>(
    key: K,
    variables: Variables<K>,
    language: string
  ): string;
}

export interface LookupWithLanguageBinding {
  (k: KeysWithNoVariables): string;
  <K extends KeysWithVariables>(key: K, variables: Variables<K>): string;
}

export function bindLanguageToLookup(
  localize: LocalizeFunction,
  language: string
): LookupWithLanguageBinding {
  const s = ((key: any, variables: any) =>
    localize(key, variables, language)) as LookupWithLanguageBinding;
  return s;
}

export { DictionaryKey };
