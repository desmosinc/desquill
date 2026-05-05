declare function isEqual(_x: any, _y: any): boolean;
declare function pick<V, K extends keyof V>(
  object: V,
  keys: ReadonlyArray<K>
): Pick<V, K>;
export { isEqual, pick };
