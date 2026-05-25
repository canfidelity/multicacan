"use client";

import { IssuesPage } from "@multicacan/views/issues/components";
import { ErrorBoundary } from "@multicacan/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
