import { fetchCorpus } from "./corpusFetch";
/**
 * Englische Kernsätze aus der Build-Datei. Kein Abruf von /api/translate.
 */

export interface KernsatzTranslation {
  id: string;
  text: string;
  translated: true;
  sourceLang: "de";
}

export interface ShownKernsatz {
  text: string;
  translated: boolean;
}

export function showKernsatz(
  id: string,
  original: string,
  locale: "de" | "en",
  translations: ReadonlyMap<string, string>,
): ShownKernsatz {
  if (locale !== "en") return { text: original, translated: false };
  const text = translations.get(id);
  if (!text) return { text: original, translated: false };
  return { text, translated: true };
}

let cache: Map<string, string> | null = null;
let pending: Promise<Map<string, string>> | null = null;

export function loadKernsatzTranslations(): Promise<Map<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetchCorpus("/resonanzen-erkenntnisse-en.json")
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const map = new Map<string, string>();
      const items = Array.isArray(data?.items) ? data.items as KernsatzTranslation[] : [];
      for (const item of items) {
        if (item?.translated === true && item.id && item.text) map.set(item.id, item.text);
      }
      cache = map;
      return map;
    })
    .catch(() => {
      cache = new Map();
      return cache;
    });
  return pending;
}
