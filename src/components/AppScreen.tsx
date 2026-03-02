import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";

export default function AppScreen() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-full flex-row">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-9 bg-black/50 sm:hidden"
          onClick={closeSidebar}
        />
      )}

      <ChatArea onOpenSidebar={openSidebar} />
    </div>
  );
}
