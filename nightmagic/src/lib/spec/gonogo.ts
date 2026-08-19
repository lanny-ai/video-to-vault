import type { GoNoGo, RoiScore } from "./schema";

/**
 * The go/no-go gate. The tool must be able to recommend NOT automating:
 * low value, high risk, or high build cost all push toward no-go.
 *
 * Value = the three buckets that matter to a business
 * (revenue uplift, risk mitigation, cost savings).
 */
export function decideGoNoGo(roi: RoiScore): GoNoGo {
  const value = roi.revenueUplift + roi.riskMitigation + roi.costSavings; // 0-15
  const drag = roi.buildCost + roi.automationRisk; // 0-10

  if (roi.automationRisk >= 4.5) {
    return {
      decision: "no_go",
      rationale:
        "Automation risk is near the ceiling. A failure here would cost more than the manual process does. Revisit after the process itself is de-risked.",
    };
  }
  if (value < 4) {
    return {
      decision: "no_go",
      rationale:
        "Combined value across revenue, risk, and cost is too low to justify the build. This workflow is not worth automating yet.",
    };
  }
  if (value - drag >= 4) {
    return {
      decision: "go",
      rationale: `Value (${value.toFixed(1)}/15) clearly outweighs build cost and automation risk (${drag.toFixed(1)}/10).`,
    };
  }
  return {
    decision: "partial",
    rationale:
      "Value and drag are close. Automate the low-risk deterministic steps first; keep judgment steps with a human until evals prove them out.",
  };
}
