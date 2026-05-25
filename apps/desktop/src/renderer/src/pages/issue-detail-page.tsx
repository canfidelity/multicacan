import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IssueDetail } from "@multicacan/views/issues/components";
import { ErrorBoundary } from "@multicacan/ui/components/common/error-boundary";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { issueDetailOptions } from "@multicacan/core/issues/queries";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wsId = useWorkspaceId();
  const { data: issue } = useQuery(issueDetailOptions(wsId, id!));

  useDocumentTitle(issue ? `${issue.identifier}: ${issue.title}` : "Issue");

  if (!id) return null;
  return (
    <ErrorBoundary resetKeys={[id]}>
      <IssueDetail issueId={id} />
    </ErrorBoundary>
  );
}
