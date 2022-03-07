export function normalizeNL<T>(src: T): T extends string ? string : T {
  if (typeof src === "string") {
    return src.replace(/\r\n?/g, "\n") as T extends string ? string : T;
  }

  return src as T extends string ? string : T;
}
