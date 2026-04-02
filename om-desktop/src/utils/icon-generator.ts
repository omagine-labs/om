import { app, nativeImage, nativeTheme, type NativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * IconGenerator - Creates menu bar icons with state-based badges
 * Loads base icon from PNG file and adds colored badges with theme-aware strokes
 * Supports @2x Retina icons for sharp display on high-DPI screens
 *
 * Icon Modes:
 * - Idle state: Uses template image (macOS automatically handles dark/light per display)
 * - Badge states: Manually drawn icon with colored badge (single color choice)
 *
 * Known Limitation - Multi-Monitor with Different Menu Bar Appearances:
 * When monitors have different menu bar appearances (e.g., one dark, one light due to
 * wallpaper tinting), badge states will show the icon color based on ONE display's
 * appearance. This is because macOS only allows a single tray icon, and we must choose
 * one color when drawing manually. Template images (idle state) handle this automatically,
 * but colored badges cannot use template mode without losing their color.
 */
export class IconGenerator {
  private readonly iconSize = 22;
  private readonly retinaIconSize = 44;
  private baseIconData: Buffer | null = null;
  private baseIconData2x: Buffer | null = null;

  constructor() {
    this.loadBaseIcons();
  }

  /**
   * Load the base icon PNG files (1x and 2x)
   */
  private loadBaseIcons(): void {
    const appPath = app.getAppPath();

    // Load @2x version first (preferred for Retina)
    this.baseIconData2x = this.loadIconFromPaths(
      [
        path.join(appPath, 'assets/menu-icon@2x.png'),
        path.join(process.resourcesPath || '', 'assets/menu-icon@2x.png'),
      ],
      '@2x'
    );

    // Load 1x version as fallback
    this.baseIconData = this.loadIconFromPaths(
      [
        path.join(appPath, 'assets/menu-icon.png'),
        path.join(process.resourcesPath || '', 'assets/menu-icon.png'),
      ],
      '1x'
    );

    if (!this.baseIconData && !this.baseIconData2x) {
      console.warn(
        '[IconGenerator] Could not load any base icon, will use fallback'
      );
    }
  }

  /**
   * Try to load icon from multiple paths
   */
  private loadIconFromPaths(paths: string[], label: string): Buffer | null {
    try {
      for (const iconPath of paths) {
        if (fs.existsSync(iconPath)) {
          const image = nativeImage.createFromPath(iconPath);
          if (!image.isEmpty()) {
            console.log(`[IconGenerator] Loaded ${label} icon from:`, iconPath);
            return image.toBitmap();
          }
        }
      }
    } catch (error) {
      console.error(`[IconGenerator] Error loading ${label} icon:`, error);
    }
    return null;
  }

  /**
   * Determine if the menu bar needs light (white) icons
   * Native menu bar appearance module was disabled because its hidden NSStatusItem
   * causes spacing issues with our tray icon. Using nativeTheme instead.
   */
  private shouldUseWhiteIcon(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }

  /**
   * Create icon for menu bar with state-specific badge
   * Uses @2x version for Retina displays when available
   */
  createIcon(
    state: 'idle' | 'countdown' | 'recording' | 'uploading'
  ): NativeImage {
    // For idle state, use template mode so macOS handles menu bar appearance
    if (state === 'idle') {
      return this.createTemplateIcon();
    }

    // For states with colored badges, we need to handle colors manually
    const useWhiteIcon = this.shouldUseWhiteIcon();
    const use2x = this.baseIconData2x !== null;
    const size = use2x ? this.retinaIconSize : this.iconSize;
    const scaleFactor = use2x ? 2 : 1;
    const iconData = use2x ? this.baseIconData2x : this.baseIconData;

    const canvas = this.createIconWithBadge(
      size,
      state,
      useWhiteIcon,
      iconData,
      scaleFactor
    );
    const icon = nativeImage.createFromBuffer(canvas, {
      width: size,
      height: size,
      scaleFactor: scaleFactor,
    });

    // Disable template mode - we handle colors manually
    icon.setTemplateImage(false);

    return icon;
  }

  /**
   * Create a template icon for idle state
   * Template images let macOS automatically handle menu bar appearance
   */
  private createTemplateIcon(): NativeImage {
    const appPath = app.getAppPath();

    // Try to load @2x version first for Retina
    const paths2x = [
      path.join(appPath, 'assets/menu-icon@2x.png'),
      path.join(process.resourcesPath || '', 'assets/menu-icon@2x.png'),
    ];
    const paths1x = [
      path.join(appPath, 'assets/menu-icon.png'),
      path.join(process.resourcesPath || '', 'assets/menu-icon.png'),
    ];

    // Try @2x paths first
    for (const iconPath of paths2x) {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          icon.setTemplateImage(true);
          return icon;
        }
      }
    }

    // Fall back to 1x paths
    for (const iconPath of paths1x) {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          icon.setTemplateImage(true);
          return icon;
        }
      }
    }

    // Last resort: create fallback icon
    const size = this.iconSize;
    const pixels = new Uint8Array(size * size * 4);
    pixels.fill(0);
    this.drawFallbackIcon(pixels, size, false);
    const icon = nativeImage.createFromBuffer(Buffer.from(pixels), {
      width: size,
      height: size,
      scaleFactor: 1,
    });
    icon.setTemplateImage(true);
    return icon;
  }

  /**
   * Create icon with colored badge in corner
   */
  private createIconWithBadge(
    size: number,
    state: 'idle' | 'countdown' | 'recording' | 'uploading',
    useWhiteIcon: boolean,
    iconData: Buffer | null,
    scaleFactor: number
  ): Buffer {
    const pixels = new Uint8Array(size * size * 4);

    // Fill with transparent background
    pixels.fill(0);

    // Draw base icon from loaded PNG
    if (iconData) {
      // iconData is in BGRA format from toBitmap()
      for (let i = 0; i < iconData.length && i < pixels.length; i += 4) {
        const alpha = iconData[i + 3];
        if (alpha > 0) {
          if (useWhiteIcon) {
            // Dark menu bar appearance: make icon white
            pixels[i] = 255; // B
            pixels[i + 1] = 255; // G
            pixels[i + 2] = 255; // R
            pixels[i + 3] = alpha;
          } else {
            // Light menu bar appearance: keep original dark colors
            pixels[i] = iconData[i]; // B
            pixels[i + 1] = iconData[i + 1]; // G
            pixels[i + 2] = iconData[i + 2]; // R
            pixels[i + 3] = alpha;
          }
        }
      }
    } else {
      // Fallback: draw a simple placeholder if no icon loaded
      this.drawFallbackIcon(pixels, size, useWhiteIcon);
    }

    // Add colored badge in bottom-right corner (only if not idle)
    if (state !== 'idle') {
      this.drawBadge(pixels, size, state, useWhiteIcon, scaleFactor);
    }

    return Buffer.from(pixels);
  }

  /**
   * Draw badge with transparent stroke
   * Badge size: 6px, Stroke: 2px, Offset: 0px from corner (at 1x scale)
   */
  private drawBadge(
    pixels: Uint8Array,
    size: number,
    state: 'idle' | 'countdown' | 'recording' | 'uploading',
    _useWhiteIcon: boolean,
    scaleFactor: number
  ): void {
    const badgeColor = this.getBadgeColor(state);
    // Scale badge parameters for Retina
    const badgeSize = 6 * scaleFactor;
    const strokeWidth = 2 * scaleFactor;
    const offsetX = 0 * scaleFactor;
    const offsetY = 0 * scaleFactor;

    const badgeRadius = badgeSize / 2;
    // Position badge center from bottom-right corner
    const badgeCenterX = size - offsetX - strokeWidth - badgeRadius;
    const badgeCenterY = size - offsetY - strokeWidth - badgeRadius;
    const totalRadius = badgeRadius + strokeWidth;

    // Draw badge with transparent stroke around it
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - badgeCenterX;
        const dy = y - badgeCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= totalRadius) {
          const idx = (y * size + x) * 4;
          if (distance <= badgeRadius) {
            // Inside badge - draw badge color
            pixels[idx] = badgeColor.b;
            pixels[idx + 1] = badgeColor.g;
            pixels[idx + 2] = badgeColor.r;
            pixels[idx + 3] = 255;
          } else {
            // Inside stroke - make transparent (clear any icon pixels)
            pixels[idx] = 0;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = 0;
          }
        }
      }
    }
  }

  /**
   * Draw fallback icon if PNG couldn't be loaded
   */
  private drawFallbackIcon(
    pixels: Uint8Array,
    size: number,
    useWhiteIcon: boolean
  ): void {
    const color = useWhiteIcon
      ? { r: 255, g: 255, b: 255 }
      : { r: 80, g: 80, b: 80 };

    // Draw a simple circle as fallback
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 8;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
          const idx = (y * size + x) * 4;
          pixels[idx] = color.b;
          pixels[idx + 1] = color.g;
          pixels[idx + 2] = color.r;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  /**
   * Get badge color for state
   * Matching macOS system recording colors: green for loading, purple for recording
   */
  private getBadgeColor(
    state: 'idle' | 'countdown' | 'recording' | 'uploading'
  ): {
    r: number;
    g: number;
    b: number;
  } {
    switch (state) {
      case 'countdown':
        return { r: 44, g: 193, b: 64 }; // Green (matches macOS system green indicator)
      case 'recording':
        return { r: 89, g: 90, b: 211 }; // Purple (matches macOS screen recording indicator)
      case 'uploading':
        return { r: 0, g: 122, b: 255 }; // Blue
      default:
        return { r: 0, g: 0, b: 0 }; // No badge
    }
  }
}
