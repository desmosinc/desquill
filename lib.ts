type AnyRecord = Record<string | number | symbol, unknown>;

type Entries<Object extends AnyRecord> = {
  [Key in keyof Object]-?: [Key, Object[Key]];
}[keyof Object][];

/**
 * Returns the entries of an object narrowly typed to the exact keys and values of the object.
 *
 * @example
 * const object = { a: 1, b: 2, c: 3 };
 * const result = entries(object); // `[['a', 1], ['b', 2], ['c', 3]]`
 */
export const entries = <Object extends AnyRecord>(object: Object) =>
  Object.entries(object) as Entries<Object>;
