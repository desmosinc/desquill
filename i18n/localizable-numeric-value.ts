/**
 * By default, we coerce all numeric variables to strings before passing them in for interpolation, so that Fluent doesn't
 * automatically format them in a locale-specific way (see `coerceNumericVariables` below).  Use this wrapper when you
 * want to opt out of the string coercion, e.g. so that Fluent can format it for you or use it for selecting a plural
 * variant.
 */
export interface LocalizableNumericValue {
  readonly __isLocalizableNumericValue: true;
  readonly value: number;
}

export function localizableNumericValue(
  value: number
): LocalizableNumericValue {
  return { __isLocalizableNumericValue: true, value };
}

export function isLocalizableNumericValue(
  value: any
): value is LocalizableNumericValue {
  return value && value.__isLocalizableNumericValue;
}
