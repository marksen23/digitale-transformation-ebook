/**
 * Schwache ETags für die großen Korpus-JSONs.
 * Gleicher Text → 304, neuer Text → neuer Tag.
 */
import { createHash } from "node:crypto";

export function entityTag(text: string): string {
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

export function isNotModified(header: string | undefined, tag: string): boolean {
  if (!header) return false;
  const bare = tag.replace(/^W\//, "");
  return header.split(",").some(part => {
    const value = part.trim();
    return value === tag || value === bare;
  });
}
