import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db";
import { listFrames, listTranscript } from "@/lib/db/repo";
import { loadFixture } from "@/lib/pipeline/fixture";
import { generateMapDeterministic, parseSpokenAmount, EmptyTranscriptError } from "@/lib/pipeline/mapgen";
import { generateMap } from "@/lib/pipeline/mapgen";
import { groundedConfidence, parseSpec } from "@/lib/spec/schema";
import { lintSpec } from "@/lib/spec/triage";

describe("parseSpokenAmount", () => {
  it("parses digits", () => {
    expect(parseSpokenAmount("$1,840.50")).toBe(1840.5);
    expect(parseSpokenAmount("over 500 dollars")).toBe(500);
  });
  it("parses spoken numbers", () => {
    expect(parseSpokenAmount("five hundred dollars")).toBe(500);
    expect(parseSpokenAmount("forty")).toBe(40);
    expect(parseSpokenAmount("two thousand")).toBe(2000);
    expect(parseSpokenAmount("two thousand five hundred")).toBe(2500);
    expect(parseSpokenAmount("twenty five hundred")).toBe(2500);
  });
  it("returns null when no amount", () => {
    expect(parseSpokenAmount("no numbers here")).toBeNull();
  });
});

describe("deterministic map generation", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  function buildFixtureSpec() {
    const workflow = loadFixture("invoice-intake");
    const transcript = listTranscript(workflow.id);
    const frames = listFrames(workflow.id);
    return generateMapDeterministic({
      workflowId: workflow.id,
      title: workflow.title,
      transcript,
      frames,
    });
  }

  it("produces a valid spec from the fixture", () => {
    const spec = buildFixtureSpec();
    expect(() => parseSpec(spec)).not.toThrow();
    expect(spec.observed.length).toBe(6);
    expect(spec.steps.length).toBe(6);
  });

  it("extracts decision rules from narration", () => {
    const spec = buildFixtureSpec();
    const allRules = spec.steps.flatMap((s) => s.decisionRules);
    expect(allRules.length).toBeGreaterThanOrEqual(3);
    const thresholdRule = allRules.find((r) => /over/i.test(r.condition));
    expect(thresholdRule).toBeDefined();
    expect(thresholdRule!.source).toBe("narration");
  });

  it("creates assumptions from hedge words with proposed answers", () => {
    const spec = buildFixtureSpec();
    const usually = spec.assumptions.find((a) => /usual/i.test(a.question));
    expect(usually).toBeDefined();
    expect(usually!.status).toBe("open");
    expect(usually!.proposedAnswer.length).toBeGreaterThan(10);
  });

  it("flags the intake step for example harvesting", () => {
    const spec = buildFixtureSpec();
    const harvest = spec.assumptions.find((a) => a.harvestExamples);
    expect(harvest).toBeDefined();
    expect(spec.trigger.intakeVariants.length).toBeGreaterThanOrEqual(2);
  });

  it("marks externally visible steps and attaches evidence everywhere", () => {
    const spec = buildFixtureSpec();
    const external = spec.steps.filter((s) => s.externallyVisible);
    expect(external.length).toBeGreaterThanOrEqual(1);
    for (const step of spec.steps) {
      expect(step.evidence.length).toBeGreaterThan(0);
      expect(step.failureModes.length).toBeGreaterThan(0);
    }
  });

  it("computes grounded confidence and lints cleanly for failure modes", () => {
    const spec = buildFixtureSpec();
    const confidence = groundedConfidence(spec);
    expect(confidence.open).toBeGreaterThan(0);
    expect(confidence.ratio).toBeGreaterThan(0.4);
    const findings = lintSpec(spec);
    expect(findings.filter((f) => f.kind === "missing_failure_modes")).toHaveLength(0);
  });

  it("flags PII from frame descriptions", () => {
    resetDbForTests();
    const workflow = loadFixture("invoice-intake");
    const transcript = listTranscript(workflow.id);
    const frames = listFrames(workflow.id).map((f) => ({
      ...f,
      description: f.description + " contact billing@meridian.example",
    }));
    const spec = generateMapDeterministic({
      workflowId: workflow.id,
      title: workflow.title,
      transcript,
      frames,
    });
    expect(spec.redactionFlags.some((f) => f.kind === "pii")).toBe(true);
  });

  it("rejects an empty transcript with a coaching error", async () => {
    await expect(
      generateMap({ workflowId: "wf_x", title: "Empty", transcript: [], frames: [] }),
    ).rejects.toBeInstanceOf(EmptyTranscriptError);
  });
});
