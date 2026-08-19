import { describe, expect, it } from "vitest";
import { gateEnabled, isAuthed, tokenFor } from "@/lib/auth";

describe("password gate", () => {
  it("is disabled when no password is configured", async () => {
    expect(gateEnabled(undefined)).toBe(false);
    expect(gateEnabled("")).toBe(false);
    expect(await isAuthed(undefined, undefined)).toBe(true);
    expect(await isAuthed("", "anything")).toBe(true);
  });

  it("requires the exact token when enabled", async () => {
    const token = await tokenFor("open-sesame");
    expect(await isAuthed("open-sesame", token)).toBe(true);
    expect(await isAuthed("open-sesame", undefined)).toBe(false);
    expect(await isAuthed("open-sesame", "wrong")).toBe(false);
    expect(await isAuthed("open-sesame", await tokenFor("other"))).toBe(false);
  });

  it("derives a stable, non-reversible token", async () => {
    const a = await tokenFor("hunter2");
    const b = await tokenFor("hunter2");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("hunter2");
  });
});
