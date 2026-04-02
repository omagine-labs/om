interface TitleBarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLocalEnvironment?: boolean;
}

export default function TitleBar({
  isCollapsed,
  onToggleCollapse,
  isLocalEnvironment = false,
}: TitleBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-[48px] w-full flex items-center z-[100]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Space for traffic lights (macOS) */}
      <div className="w-[88px] shrink-0" />

      {/* LOCAL environment indicator */}
      {isLocalEnvironment && (
        <span className="text-xs font-semibold text-amber-400 mr-2">
          [LOCAL]
        </span>
      )}

      {/* Collapse toggle button */}
      <button
        onClick={onToggleCollapse}
        className="p-2 hover:bg-white/10 rounded-lg transition"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className="w-5 h-5 text-white/70"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          {isCollapsed ? (
            <path d="M11.006 4.41039L16.006 9.41039C16.3319 9.73539 16.3319 10.2629 16.006 10.5887L11.006 15.5887C10.681 15.9146 10.1535 15.9146 9.82771 15.5887C9.50187 15.2637 9.50187 14.7354 9.82771 14.4104L14.2385 9.99956L9.82771 5.58872C9.50187 5.26372 9.50187 4.73539 9.82771 4.41039C10.1527 4.08456 10.681 4.08456 11.006 4.41039ZM5.17271 4.41039L10.1727 9.41039C10.4985 9.73539 10.4985 10.2629 10.1727 10.5887L5.17271 15.5887C4.84771 15.9146 4.31937 15.9146 3.99437 15.5887C3.66854 15.2637 3.66854 14.7354 3.99437 14.4104L8.40521 9.99956L3.99437 5.58872C3.66854 5.26372 3.66854 4.73539 3.99437 4.41039C4.31937 4.08456 4.84771 4.08456 5.17271 4.41039Z" />
          ) : (
            <path d="M10.1727 5.58872L5.76187 9.99956L10.1727 14.4104C10.4985 14.7354 10.4985 15.2637 10.1727 15.5887C9.84687 15.9146 9.31937 15.9146 8.99437 15.5887L3.99437 10.5887C3.66854 10.2629 3.66854 9.73539 3.99437 9.41039L8.99437 4.41039C9.31937 4.08456 9.84771 4.08456 10.1727 4.41039C10.4985 4.73539 10.4985 5.26372 10.1727 5.58872ZM16.006 5.58872L11.5952 9.99956L16.006 14.4104C16.3319 14.7354 16.3319 15.2637 16.006 15.5887C15.6802 15.9146 15.1527 15.9146 14.8277 15.5887L9.82771 10.5887C9.50187 10.2629 9.50187 9.73539 9.82771 9.41039L14.8277 4.41039C15.1527 4.08456 15.681 4.08456 16.006 4.41039C16.3319 4.73539 16.3319 5.26372 16.006 5.58872Z" />
          )}
        </svg>
      </button>

      {/* Future: Announcement/news area can go here */}
    </div>
  );
}
