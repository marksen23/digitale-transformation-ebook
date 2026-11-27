/**
 * Korpus-JSON ohne Cache-Bust. Der Server antwortet mit ETag;
 * ein unveränderter Stand kommt als 304 zurück.
 */
export function fetchCorpus(path: string): Promise<Response> {
  const clean = path.split("?")[0];
  return fetch(clean, { cache: "no-cache" });
}
