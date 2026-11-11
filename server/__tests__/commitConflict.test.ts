import { afterEach, describe, expect, it, vi } from "vitest";
import { appendToIndex, getIndexUpdaterHealth } from "../lib/indexUpdater.js";
import { getResonanzLogHealth, logResonanz } from "../lib/resonanzLog.js";
import { isNonFastForwardConflict, resumeAfterConflict } from "../lib/resonanz-log-utils.js";

const savedToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
});

describe("resumeAfterConflict", () => {
  it("erkennt non-fast-forward und entscheidet Create, Update oder schon gelandet", () => {
    expect(isNonFastForwardConflict(409, "Conflict")).toBe(true);
    expect(isNonFastForwardConflict(422, "Update is not a fast forward")).toBe(true);
    expect(isNonFastForwardConflict(422, "Invalid request")).toBe(false);
    expect(isNonFastForwardConflict(401, "Bad credentials")).toBe(false);

    expect(resumeAfterConflict(null, "md")).toEqual({ kind: "retry-create" });
    expect(resumeAfterConflict({ sha: "abc", text: "md" }, "md")).toEqual({ kind: "landed" });
    expect(resumeAfterConflict({ sha: "abc", text: "alt" }, "md")).toEqual({ kind: "retry-update", sha: "abc" });
  });
});

function indexResponse(sha: string) {
  const content = Buffer.from(JSON.stringify({
    generatedAt: "2026-11-11T00:00:00.000Z",
    count: 0,
    entries: [],
  })).toString("base64");
  return new Response(JSON.stringify({ sha, content }), { status: 200 });
}

describe("appendToIndex", () => {
  it("holt nach 409 einen neuen SHA und schreibt den Eintrag erneut", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const shas: string[] = [];
    let gets = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body));
        shas.push(body.sha);
        if (shas.length === 1) return new Response("not a fast forward", { status: 409 });
        return new Response("ok", { status: 201 });
      }
      gets++;
      return indexResponse(gets === 1 ? "sha-1" : "sha-2");
    });

    const before = getIndexUpdaterHealth().appendSuccessCount;
    await appendToIndex({
      id: "BAND2KAP5-TEST",
      ts: "2026-11-11T16:00:00.000Z",
      endpoint: "chapter",
      anchor: "chapter:band2-kap5",
      nodeIds: [],
      status: "raw",
      prompt: "Was meint der Mut zur Imperfektion?",
      response: "Eine ausreichend lange Antwort, die der Leser schon gesehen hat.",
      contextMeta: {},
    });
    expect(shas).toEqual(["sha-1", "sha-2"]);
    expect(getIndexUpdaterHealth().appendSuccessCount).toBe(before + 1);
  });
});

describe("logResonanz", () => {
  it("wiederholt den Commit nach non-fast-forward und schreibt keinen Freitext-Anker", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const mdPuts: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u.includes("raw.githubusercontent.com")) return new Response("no", { status: 404 });
      if (u.includes("resonanzen-index.json")) {
        if (method === "PUT") return new Response("ok", { status: 201 });
        return indexResponse("idx");
      }
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body));
        mdPuts.push(String(body.message));
        if (mdPuts.length === 1) {
          return new Response(JSON.stringify({ message: "Update is not a fast forward" }), { status: 409 });
        }
        return new Response(JSON.stringify({ content: { sha: "new" } }), { status: 201 });
      }
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    });

    const beforeFail = getResonanzLogHealth().failureCount;
    await logResonanz({
      endpoint: "dialog",
      anchor: "dialog:Freiheit, Gelassenheit, Werden",
      nodeIds: ["freiheit", "gelassenheit", "werden"],
      prompt: "Wie hält eine Pädagogik das Irritierbare aus?",
      response: "Eine ausreichend lange Antwort, die im Korpus unter Begriffs-IDs landen soll.",
      model: "gemini-2.5-flash",
    });
    expect(mdPuts).toHaveLength(2);
    expect(mdPuts[0]).toContain("dialog:freiheit+gelassenheit+werden");
    expect(mdPuts[0]).not.toContain("Freiheit");
    expect(getResonanzLogHealth().failureCount).toBe(beforeFail);

    const putsBeforeDup = mdPuts.length;
    await logResonanz({
      endpoint: "dialog",
      anchor: "dialog:freiheit+gelassenheit+werden",
      nodeIds: ["freiheit", "gelassenheit", "werden"],
      prompt: "Wie hält eine Pädagogik das Irritierbare aus?",
      response: "Eine ausreichend lange Antwort, die im Korpus unter Begriffs-IDs landen soll.",
      model: "gemini-2.5-flash",
    });
    expect(mdPuts).toHaveLength(putsBeforeDup);

    const beforeSkip = getResonanzLogHealth().skippedInvalidAnchor;
    await logResonanz({
      endpoint: "dialog",
      anchor: "dialog:???",
      prompt: "Noch eine andere Frage zum Korpus?",
      response: "Eine ausreichend lange Antwort, deren Anker nicht zu retten ist.",
      model: "gemini-2.5-flash",
    });
    expect(getResonanzLogHealth().skippedInvalidAnchor).toBe(beforeSkip + 1);
    expect(mdPuts).toHaveLength(putsBeforeDup);
  });
});
