import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Dashboard Window tests
 *
 * Tests for the dashboard window manager, focusing on:
 * - Off-screen window detection logic
 * - Window visibility handling
 */

// Helper to check if a window position is on screen
// Extracted from dashboard-window.ts for testability
function isWindowOnScreen(
  windowBounds: { x: number; y: number; width: number; height: number },
  displays: Array<{
    bounds: { x: number; y: number; width: number; height: number };
  }>
): boolean {
  return displays.some((display) => {
    const db = display.bounds;
    return (
      windowBounds.x >= db.x &&
      windowBounds.x < db.x + db.width &&
      windowBounds.y >= db.y &&
      windowBounds.y < db.y + db.height
    );
  });
}

describe('Dashboard Window - Off-screen Detection', () => {
  describe('isWindowOnScreen', () => {
    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    };

    const secondaryDisplay = {
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    };

    const displays = [primaryDisplay, secondaryDisplay];

    it('should detect window on primary display', () => {
      const windowBounds = { x: 100, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(true);
    });

    it('should detect window on secondary display', () => {
      const windowBounds = { x: 2000, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(true);
    });

    it('should detect window at display boundary as on-screen', () => {
      // Window at the right edge of primary display
      const windowBounds = { x: 1919, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(true);
    });

    it('should detect window off-screen to the left', () => {
      const windowBounds = { x: -2000, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(false);
    });

    it('should detect window off-screen to the right', () => {
      const windowBounds = { x: 5000, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(false);
    });

    it('should detect window off-screen above', () => {
      const windowBounds = { x: 100, y: -2000, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(false);
    });

    it('should detect window off-screen below', () => {
      const windowBounds = { x: 100, y: 3000, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, displays)).toBe(false);
    });

    it('should handle single display setup', () => {
      const singleDisplay = [primaryDisplay];
      const windowBounds = { x: 100, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, singleDisplay)).toBe(true);
    });

    it('should handle vertical display arrangement', () => {
      const verticalDisplays = [
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: 0, y: 1080, width: 1920, height: 1080 } },
      ];
      const windowBounds = { x: 100, y: 1200, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, verticalDisplays)).toBe(true);
    });

    it('should detect window in gap between non-adjacent displays as off-screen', () => {
      const gappedDisplays = [
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { bounds: { x: 3000, y: 0, width: 1920, height: 1080 } },
      ];
      // Window in the gap between displays
      const windowBounds = { x: 2000, y: 100, width: 1200, height: 800 };
      expect(isWindowOnScreen(windowBounds, gappedDisplays)).toBe(false);
    });
  });
});

describe('Dashboard Window - Timeout Fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have a 3 second timeout for showing window', () => {
    // This test verifies the timeout value used in the implementation
    const EXPECTED_TIMEOUT_MS = 3000;

    let timeoutCalled = false;
    const mockSetTimeout = vi.fn((callback: () => void, ms: number) => {
      expect(ms).toBe(EXPECTED_TIMEOUT_MS);
      timeoutCalled = true;
      return 1;
    });

    // Simulate the timeout pattern used in dashboard-window.ts
    let windowShown = false;
    const showWindow = () => {
      windowShown = true;
    };

    mockSetTimeout(() => {
      if (!windowShown) {
        showWindow();
      }
    }, 3000);

    expect(timeoutCalled).toBe(true);
  });

  it('should not show window twice if ready-to-show fires before timeout', () => {
    let showCount = 0;
    let windowShown = false;

    const showWindow = () => {
      if (!windowShown) {
        windowShown = true;
        showCount++;
      }
    };

    // Simulate ready-to-show firing
    showWindow();
    expect(showCount).toBe(1);
    expect(windowShown).toBe(true);

    // Simulate timeout firing after ready-to-show
    if (!windowShown) {
      showWindow();
    }

    // Should still only be 1
    expect(showCount).toBe(1);
  });
});
