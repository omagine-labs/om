'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/lib/auth';
import HomeIcon from '@/components/icons/HomeIcon';
import MeetingsIcon from '@/components/icons/MeetingsIcon';
import { useState, useRef, useEffect } from 'react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useSpeakerIdentificationModalContext } from '@/contexts/SpeakerIdentificationModalContext';

interface AppSidebarProps {
  userName: string;
  userEmail: string;
  unassignedCount?: number;
  firstUnassignedMeetingId?: string | null;
}

export default function AppSidebar({
  userName,
  userEmail,
  unassignedCount = 0,
  firstUnassignedMeetingId = null,
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();
  const { openSpeakerModal } = useSpeakerIdentificationModalContext();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  // Display name if different from email, otherwise just email
  const displayText = userName !== userEmail ? userName : userEmail;

  // Helper function to determine if a link is active
  const isActive = (path: string) => pathname === path;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  return (
    <aside
      className={`fixed left-0 top-[48px] h-[calc(100vh-48px)] z-50 flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Navigation */}
      <nav className="flex-1 p-4 pt-0">
        {/* Main Nav Items */}
        <ul className="space-y-1">
          <li>
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition font-medium ${
                isActive('/dashboard')
                  ? 'bg-black/40 text-white'
                  : 'text-white hover:bg-white/10'
              } ${isCollapsed ? 'justify-center w-[52px] h-[52px]' : ''}`}
              title={isCollapsed ? 'Home' : ''}
            >
              <HomeIcon
                className="w-7 h-7 flex-shrink-0"
                active={isActive('/dashboard')}
              />
              {!isCollapsed && <span className="text-[15px]">Home</span>}
            </Link>
          </li>
          <li>
            <Link
              href="/meetings"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition font-medium ${
                isActive('/meetings')
                  ? 'bg-black/40 text-white'
                  : 'text-white hover:bg-white/10'
              } ${isCollapsed ? 'justify-center w-[52px] h-[52px]' : ''}`}
              title={isCollapsed ? 'Meetings' : ''}
            >
              <MeetingsIcon
                className="w-7 h-7 flex-shrink-0"
                active={isActive('/meetings')}
              />
              {!isCollapsed && <span className="text-[15px]">Meetings</span>}
            </Link>
          </li>
        </ul>

        {/* Separator */}
        <div className="px-3 my-6">
          <div className="h-[2px] bg-black/20 rounded-full shadow-[0px_1px_0px_0px_rgba(255,255,255,0.2)]" />
        </div>

        {/* Unassigned Meetings (if any) */}
        {unassignedCount > 0 && firstUnassignedMeetingId && (
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => openSpeakerModal(firstUnassignedMeetingId)}
                className={`flex items-center gap-3 px-3 py-3 rounded-md transition font-medium text-white hover:bg-white/10 w-full ${
                  isCollapsed ? 'justify-center w-[52px] h-[52px]' : ''
                }`}
                title={isCollapsed ? `${unassignedCount} unassigned` : ''}
              >
                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                  <div className="w-6 h-6 bg-amber-300 rounded-[5px] flex items-center justify-center">
                    <span className="text-[14px] font-bold text-teal-950">
                      {unassignedCount}
                    </span>
                  </div>
                </div>
                {!isCollapsed && (
                  <span className="text-[15px]">Unassigned meetings</span>
                )}
              </button>
            </li>
          </ul>
        )}
      </nav>

      {/* User Info & Menu */}
      <div className="p-4 relative" ref={userMenuRef}>
        {!isCollapsed && (
          <>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="w-full p-2 rounded-lg hover:bg-white/10 transition cursor-pointer text-left flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {displayText}
                </p>
                <p className="text-xs text-white/60 truncate">{userEmail}</p>
              </div>
              <svg
                className={`w-4 h-4 text-white/60 flex-shrink-0 ml-2 transition-transform ${
                  isUserMenuOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Dropdown Menu - Dark Theme */}
            {isUserMenuOpen && (
              <div className="absolute bottom-4 left-full ml-2 w-64 bg-teal-950 rounded-xl shadow-lg border border-white/10 p-3 z-50">
                {/* User Info Header */}
                <div className="px-3 py-2 mb-2">
                  <p className="text-sm font-medium text-white truncate">
                    {displayText}
                  </p>
                  <p className="text-xs text-white/60 truncate">{userEmail}</p>
                </div>

                {/* Navigation Options */}
                <Link
                  href="/settings/subscription"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="block px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
                >
                  Subscription
                </Link>

                {/* Log out */}
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 bg-white/5 hover:bg-white/10 rounded-lg transition flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Log out
                </button>
              </div>
            )}
          </>
        )}
        {isCollapsed && (
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-10 h-10 mx-auto rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition cursor-pointer"
            title={displayText}
          >
            <span className="text-sm font-medium">
              {displayText.charAt(0).toUpperCase()}
            </span>
          </button>
        )}
        {isCollapsed && isUserMenuOpen && (
          <div className="absolute bottom-4 left-full ml-2 w-64 bg-teal-950 rounded-xl shadow-lg border border-white/10 p-3 z-50">
            {/* User Info Header */}
            <div className="px-3 py-2 mb-2">
              <p className="text-sm font-medium text-white truncate">
                {displayText}
              </p>
              <p className="text-xs text-white/60 truncate">{userEmail}</p>
            </div>

            {/* Navigation Options */}
            <Link
              href="/settings/subscription"
              onClick={() => setIsUserMenuOpen(false)}
              className="block px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
            >
              Subscription
            </Link>

            {/* Log out */}
            <button
              onClick={() => {
                setIsUserMenuOpen(false);
                handleSignOut();
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-400 bg-white/5 hover:bg-white/10 rounded-lg transition flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
