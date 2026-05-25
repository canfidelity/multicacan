"use client";

import { DashboardLayout } from "@multicacan/views/layout";
import { MulticaIcon } from "@multicacan/ui/components/common/multica-icon";
import { SearchCommand, SearchTrigger } from "@multicacan/views/search";
import { ChatFab, ChatWindow } from "@multicacan/views/chat";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<MulticaIcon className="size-6" />}
      searchSlot={<SearchTrigger />}
      extra={
        <>
          <SearchCommand />
          <ChatWindow />
          <ChatFab />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
