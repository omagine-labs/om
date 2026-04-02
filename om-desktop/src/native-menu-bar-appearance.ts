import path from 'node:path';
import { app } from 'electron';

interface NativeBindings {
  isDarkMenuBar(): boolean;
  startObserving(callback: (isDark: boolean) => void): void;
  stopObserving(): void;
  initialize(): void;
  cleanup(): void;
}

/**
 * MenuBarAppearance - Native module wrapper for menu bar appearance detection
 *
 * This module uses NSStatusItem.button.effectiveAppearance to detect the actual
 * menu bar appearance, which correctly handles:
 * - System dark/light mode
 * - Wallpaper-based menu bar tinting (Big Sur+)
 * - Auto appearance mode
 *
 * This is the correct API to use instead of systemPreferences.getEffectiveAppearance()
 * which returns the app's appearance, not the menu bar's appearance.
 */
export class MenuBarAppearance {
  private addon: NativeBindings | null = null;
  private initialized = false;
  private observing = false;
  private callback: ((isDark: boolean) => void) | null = null;

  constructor() {
    try {
      this.addon = this.loadAddon();
      this.initialized = true;
    } catch (error) {
      console.error(
        '[MenuBarAppearance] Failed to load native addon:',
        (error as Error).message
      );
      this.addon = null;
    }
  }

  private loadAddon(): NativeBindings {
    // Dynamic require is necessary here because the native module path is determined at runtime
    // In development: load from build/Release/
    // In production: load from extraResources (outside the asar)
    const getAddonPath = () => {
      const extraResourcePath = path.join(
        process.resourcesPath,
        'menu_bar_appearance.node'
      );
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      if (require('fs').existsSync(extraResourcePath)) {
        return extraResourcePath;
      }
      return path.join(
        app.getAppPath(),
        'build/Release/menu_bar_appearance.node'
      );
    };
    const addonPath = getAddonPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(addonPath);
  }

  /**
   * Check if the menu bar currently has a dark appearance
   * This uses NSStatusItem.button.effectiveAppearance which correctly
   * detects the actual menu bar appearance, including wallpaper-based tinting
   *
   * @returns true if menu bar is dark (needs white icons), false if light
   */
  isDarkMenuBar(): boolean {
    if (!this.addon) {
      // Fallback: use nativeTheme if native module not available
      console.warn(
        '[MenuBarAppearance] Native module not available, using fallback'
      );
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nativeTheme } = require('electron');
      return nativeTheme.shouldUseDarkColors;
    }

    try {
      return this.addon.isDarkMenuBar();
    } catch (error) {
      console.error('[MenuBarAppearance] Error checking dark menu bar:', error);
      return false;
    }
  }

  /**
   * Start observing menu bar appearance changes
   * The callback will be called immediately with the current state,
   * and then again whenever the appearance changes
   *
   * @param callback Function to call when appearance changes (true = dark)
   */
  startObserving(callback: (isDark: boolean) => void): void {
    if (!this.addon) {
      console.warn(
        '[MenuBarAppearance] Native module not available, cannot observe'
      );
      // Still call callback once with fallback value
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nativeTheme } = require('electron');
      callback(nativeTheme.shouldUseDarkColors);
      return;
    }

    if (this.observing) {
      console.log('[MenuBarAppearance] Already observing, updating callback');
      this.callback = callback;
      return;
    }

    try {
      this.callback = callback;
      this.addon.startObserving((isDark: boolean) => {
        console.log('[MenuBarAppearance] Appearance changed, isDark:', isDark);
        if (this.callback) {
          this.callback(isDark);
        }
      });
      this.observing = true;
      console.log('[MenuBarAppearance] Started observing');
    } catch (error) {
      console.error('[MenuBarAppearance] Error starting observation:', error);
    }
  }

  /**
   * Stop observing menu bar appearance changes
   */
  stopObserving(): void {
    if (!this.addon || !this.observing) {
      return;
    }

    try {
      this.addon.stopObserving();
      this.observing = false;
      this.callback = null;
      console.log('[MenuBarAppearance] Stopped observing');
    } catch (error) {
      console.error('[MenuBarAppearance] Error stopping observation:', error);
    }
  }

  /**
   * Cleanup resources - should be called on app shutdown
   */
  cleanup(): void {
    if (!this.addon) {
      return;
    }

    try {
      this.addon.cleanup();
      this.observing = false;
      this.callback = null;
      console.log('[MenuBarAppearance] Cleaned up');
    } catch (error) {
      console.error('[MenuBarAppearance] Error during cleanup:', error);
    }
  }

  /**
   * Check if the native module is available
   */
  isAvailable(): boolean {
    return this.initialized && this.addon !== null;
  }
}

// Singleton instance
let instance: MenuBarAppearance | null = null;

export function getMenuBarAppearance(): MenuBarAppearance {
  if (!instance) {
    instance = new MenuBarAppearance();
  }
  return instance;
}
