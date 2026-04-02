import { Link, useLocation } from 'react-router-dom';
import HomeIcon from '@/components/icons/HomeIcon';
import MeetingsIcon from '@/components/icons/MeetingsIcon';
import { useState, useRef, useEffect } from 'react';

interface AppSidebarProps {
  userName: string;
  userEmail: string;
  isCollapsed: boolean;
  unassignedCount?: number;
  firstUnassignedMeetingId?: string | null;
  onIdentifySpeaker?: (meetingId: string) => void;
}

export default function AppSidebar({
  userName,
  userEmail,
  isCollapsed,
  unassignedCount = 0,
  firstUnassignedMeetingId = null,
  onIdentifySpeaker,
}: AppSidebarProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Listen for update available events
  useEffect(() => {
    if (!window.electronAPI?.on) return;

    const cleanups = [
      window.electronAPI.on('auto-updater:update-available', () => {
        setHasUpdateAvailable(true);
      }),

      window.electronAPI.on('auto-updater:update-downloaded', () => {
        setHasUpdateAvailable(true);
      }),

      window.electronAPI.on('auto-updater:update-not-available', () => {
        setHasUpdateAvailable(false);
      }),
    ];

    // Clean up all event listeners when component unmounts
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const handleSignOut = async () => {
    // Use IPC handler to sign out
    await window.electronAPI.auth.signOut();
    // Immediately reload the window to reflect sign-out state
    window.location.reload();
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
              to="/dashboard"
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
              to="/meetings"
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
        {unassignedCount > 0 &&
          firstUnassignedMeetingId &&
          onIdentifySpeaker && (
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => onIdentifySpeaker(firstUnassignedMeetingId)}
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
                  to="/settings"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center justify-between px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
                >
                  <span>Settings</span>
                  {hasUpdateAvailable && (
                    <span className="flex items-center justify-center w-2 h-2 bg-blue-400 rounded-full" />
                  )}
                </Link>
                <Link
                  to="/settings/subscription"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="block px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
                >
                  Subscription
                </Link>

                {/* Sign out */}
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
                  Sign out
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
              to="/settings"
              onClick={() => setIsUserMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
            >
              <span>Settings</span>
              {hasUpdateAvailable && (
                <span className="flex items-center justify-center w-2 h-2 bg-blue-400 rounded-full" />
              )}
            </Link>
            <Link
              to="/settings/subscription"
              onClick={() => setIsUserMenuOpen(false)}
              className="block px-3 py-2 mb-2 text-sm text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
            >
              Subscription
            </Link>

            {/* Sign out */}
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
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
