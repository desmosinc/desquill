import en from 'text!../l10n/en.ftl';

import type {
  DictionaryKey,
  KeysWithNoVariables
} from '../dictionary-types-generated.ts';
import type {
  KeysWithVariables,
  Variables,
  Vars
} from '../mq-i18n-interface.ts';
import {
  FluentBundleSequence,
  type FluentBundleSequenceOptions
} from './fluent-bundle-sequence.ts';

const ftlSources: Record<string, string | undefined> = { en };

const fluentBundleCache: {
  [lang: string]: FluentBundleSequence<string> | undefined;
} = {};

export function bundledLocalize(
  k: KeysWithNoVariables,
  variables: undefined,
  language: string
): string;
export function bundledLocalize<K extends KeysWithVariables>(
  key: K,
  variables: Variables<K>,
  language: string
): string;
export function bundledLocalize(
  key: DictionaryKey,
  variables: Vars | undefined,
  language: string
) {
  return formatWithFluent(key, variables ?? {}, language);
}

export const bundledSupportedLanguages = Object.keys(ftlSources);

function formatWithFluent(
  key: DictionaryKey,
  variables: Vars,
  language: string
) {
  const ftl = getFluentBundleSequence(language);
  const formatted = ftl.format(key, stripUndefined(variables));
  if (formatted == undefined) {
    console.warn(`Could not format string ${key}`);
    return '';
  }
  return formatted;
}

function stripUndefined<T>(
  obj: Record<string, T | undefined>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key in obj) {
    const val = obj[key];
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

function getFluentBundleSequence(
  targetLang: string
): FluentBundleSequence<string> {
  let ftl = fluentBundleCache[targetLang];
  if (!ftl) {
    const bundles: { lang: string; source: string }[] = [];
    const source = ftlSources[targetLang];
    if (source) {
      bundles.push({ lang: targetLang, source });
    }

    const options: FluentBundleSequenceOptions = {};
    if (targetLang === 'xx-XX') {
      options.transform = (s: string) => s.replace(/[a-z]/gi, '♦');
    }

    ftl = fluentBundleCache[targetLang] = FluentBundleSequence.fromSources(
      [...bundles, { lang: 'en', source: en }],
      (err) => {
        console.warn(err);
      },
      options
    );
  }

  return ftl;
}
