/**
 * JSON-Dateien unter client/public, die Embedding-Vektoren enthalten.
 * Sie bleiben auf der Platte (Build, RAG, Ähnlichkeitssuche), werden aber
 * nicht an den Browser ausgeliefert — weder als Static-Asset noch über
 * den GitHub-Raw-Proxy.
 */
export const HEAVY_PUBLIC_JSON = [
  "werk-chunks.json",
  "resonanzen-embeddings.json",
  "resonanzen-question-embeddings.json",
  "concepts-embeddings.json",
  "philosophers-embeddings.json",
] as const;

const HEAVY = new Set<string>(HEAVY_PUBLIC_JSON);

/** `name` ist ein Dateiname oder ein URL-Pfad (`/werk-chunks.json`). */
export function isHeavyPublicJson(name: string): boolean {
  const base = name.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  return HEAVY.has(base);
}
