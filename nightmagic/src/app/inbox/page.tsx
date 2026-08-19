import { getWorkflow, listPendingApprovals } from "@/lib/db/repo";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const pending = listPendingApprovals();
  const items = pending.map((approval) => {
    const workflow = getWorkflow(approval.workflowId);
    const step = workflow?.spec?.steps.find((s) => s.id === approval.stepId);
    return {
      id: approval.id,
      workflowId: approval.workflowId,
      workflowTitle: workflow?.spec?.title ?? "Workflow",
      stepTitle: step?.title ?? approval.stepId,
      approvals: step?.approvalStats.approvals ?? 0,
      reasoning: approval.reasoning,
      draft: approval.draft,
      createdAt: approval.createdAt,
      runId: approval.runId,
    };
  });
  return <InboxClient items={items} />;
}
