import crypto from "node:crypto";

export function contentHashFor(prompt: string, response: string): string {
  const h = crypto.createHash("sha256");
  h.update(prompt);
  h.update("\n---\n");
  h.update(response);
  return h.digest("hex").slice(0, 16);
}

export function checkAnchorFormat(endpoint: string, anchor: string): string | null {
  if (endpoint === "chapter") {
    if (!/^chapter:[a-z0-9äöüß-]+$/.test(anchor)) return "expected chapter:<id>";
  } else if (endpoint === "analyse") {
    if (!/^analyse:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected analyse:<idA>+<idB>+…";
  } else if (endpoint === "path-analyse") {
    if (!/^path-analyse:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected path-analyse:<from>+<to>";
  } else if (endpoint === "translate") {
    if (!/^translate:[a-z0-9äöüß_+-]+$/.test(anchor)) return "expected translate:<chapterId>+<lang>";
  } else if (endpoint === "graph-chat") {
    if (anchor !== "graph") return "expected 'graph'";
  } else if (endpoint === "enkidu") {
    if (anchor !== "enkidu") return "expected 'enkidu'";
  } else if (endpoint === "passage") {
    if (!/^passage:[a-f0-9]{8}$/.test(anchor)) return "expected passage:<chunkId-8>";
  } else if (endpoint === "dialog") {
    if (!/^dialog:[a-zäöüß0-9_+-]+$/i.test(anchor)) return "expected dialog:<focus> or dialog:freier";
  }
  return null;
}
