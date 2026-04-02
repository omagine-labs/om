'use client';

import { useSidebar } from '@/contexts/SidebarContext';
import { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={`pt-[48px] pr-2 pb-2 transition-all duration-300 ${
        isCollapsed ? 'ml-20' : 'ml-64'
      }`}
    >
      <div className="h-[calc(100vh-56px)] rounded-xl overflow-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
        {children}
      </div>
    </main>
  );
}
