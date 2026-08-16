'use client';

import React, { useState } from 'react';
import { Sidebar } from '../src/components/layout/sidebar';
import { Header } from '../src/components/layout/header';
import { ChatInterface } from '../src/components/chat/chat-interface';

export default function Home() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Desktop & Mobile Responsive Sidebar */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
        {/* Mobile Header Bar */}
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* Chat Screen */}
        <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
          <ChatInterface />
        </main>
      </div>
    </div>
  );
}
