import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { resetDbForTests } from "@/lib/db";
import { captureRecording, buildOperatingMap } from "@/lib/pipeline";
import {
  clearProgressForTests,
  getProgress,
  isValidProgressId,
  reportProgress,
} from "@/lib/pipeline/progress";

/**
 * Live progress: real stages only, invalid ids ignored, entries expire.
 */

beforeEach(() => {
  resetDbForTests();
  clearProgressForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("progress registry", () => {
  it("stores and returns the latest stage", () => {
    reportProgress("test-progress-1", "frames", "Found 14 screens", { total: 14 });
    reportProgress("test-progress-1", "reading", "Reading screen 3 of 14", {
      current: 3,
      total: 14,
    });
    const progress = getProgress("test-progress-1");
    expect(progress?.stage).toBe("reading");
    expect(progress?.detail).toBe("Reading screen 3 of 14");
    expect(progress?.current).toBe(3);
    expect(progress?.total).toBe(14);
  });

  it("validates ids and silently ignores invalid ones", () => {
    expect(isValidProgressId("2f6c1f2a-aaaa-bbbb-cccc-1234567890ab")).toBe(true);
    expect(isValidProgressId("short")).toBe(false);
    expect(isValidProgressId("../../etc/passwd")).toBe(false);
    reportProgress("bad id!", "frames", "nope");
    expect(getProgress("test-progress-2")).toBeNull();
  });

  it("ignores reports with no id (progress is optional everywhere)", () => {
    expect(() => reportProgress(undefined, "frames", "no listener")).not.toThrow();
  });

  it("expires abandoned entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T00:00:00Z"));
    reportProgress("test-progress-3", "frames", "Found 5 screens");
    vi.setSystemTime(new Date("2026-08-19T00:20:00Z"));
    expect(getProgress("test-progress-3")).toBeNull();
  });
});

describe("pipeline progress integration", () => {
  it("reports real stages through a fixture capture and map build", async () => {
    const pid = "test-progress-fixture";
    const workflow = await captureRecording({
      source: "fixture://invoice-intake",
      progressId: pid,
    });
    expect(getProgress(pid)?.stage).toBe("fetching");

    await buildOperatingMap(workflow.id, pid);
    const progress = getProgress(pid);
    expect(progress?.stage).toBe("mapping");
    expect(progress?.detail).toContain("operating map");
  });
});
