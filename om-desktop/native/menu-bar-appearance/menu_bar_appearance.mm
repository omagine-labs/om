#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#include "menu_bar_appearance.h"

// Persistent status item for appearance detection
// Using NSVariableStatusItemLength with no icon/title = zero width, no spacing impact
static NSStatusItem *g_appearanceItem = nil;
static bool g_isDark = YES;  // Default to dark (safer for dark menu bars)
static int g_consecutiveReadings = 0;
static bool g_lastReading = YES;
static const int kRequiredConsecutiveReadings = 3;  // Require 3 consistent readings

// Stabilization: ignore readings for first 1 second after creation
static NSDate *g_creationTime = nil;
static bool g_stabilized = false;
static const NSTimeInterval kStabilizationDelaySeconds = 1.0;

// Observer for appearance changes
@interface AppearanceObserver : NSObject
@end

@implementation AppearanceObserver

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context {
    if ([keyPath isEqualToString:@"button.effectiveAppearance"]) {
        [self updateAppearance];
    }
}

- (void)updateAppearance {
    if (g_appearanceItem && g_appearanceItem.button) {
        // Check if we're still in stabilization period
        if (!g_stabilized && g_creationTime) {
            NSTimeInterval elapsed = [[NSDate date] timeIntervalSinceDate:g_creationTime];
            if (elapsed < kStabilizationDelaySeconds) {
                // Still stabilizing - ignore this reading
                return;
            }
            // Stabilization complete
            g_stabilized = true;
            NSLog(@"[MenuBarAppearance] Stabilization complete after %.2fs", elapsed);
        }

        NSAppearance *appearance = g_appearanceItem.button.effectiveAppearance;
        if (appearance) {
            NSString *name = appearance.name;
            // Only use Vibrant appearances (actual menu bar), ignore Aqua (app window)
            if ([name containsString:@"Vibrant"]) {
                bool newIsDark = [name.lowercaseString containsString:@"dark"];

                // Debounce: require consecutive consistent readings before changing
                if (newIsDark == g_lastReading) {
                    g_consecutiveReadings++;
                } else {
                    g_consecutiveReadings = 1;
                    g_lastReading = newIsDark;
                }

                // Only update if we have enough consistent readings AND value differs
                if (g_consecutiveReadings >= kRequiredConsecutiveReadings && newIsDark != g_isDark) {
                    g_isDark = newIsDark;
                    NSLog(@"[MenuBarAppearance] Menu bar stable: %@ (isDark: %@)",
                          name, g_isDark ? @"YES" : @"NO");
                }
            }
        }
    }
}

@end

static AppearanceObserver *g_observer = nil;

namespace menu_bar_appearance {

static void EnsureStatusItem() {
    if (g_appearanceItem) return;

    dispatch_block_t createItem = ^{
        // Record creation time for stabilization
        g_creationTime = [NSDate date];
        g_stabilized = false;

        // Create status item with variable length - will be zero width with no content
        g_appearanceItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];

        // Don't set any icon or title - this makes it truly invisible with zero width
        // The button still exists and has effectiveAppearance

        if (g_appearanceItem && g_appearanceItem.button) {
            // Create observer
            g_observer = [[AppearanceObserver alloc] init];

            // Start observing appearance changes
            [g_appearanceItem addObserver:g_observer
                              forKeyPath:@"button.effectiveAppearance"
                                 options:NSKeyValueObservingOptionNew | NSKeyValueObservingOptionInitial
                                 context:nil];

            // Note: Don't call updateAppearance here - let KVO handle it after stabilization
            NSLog(@"[MenuBarAppearance] Created appearance detection status item (stabilizing for %.1fs)", kStabilizationDelaySeconds);
        }
    };

    if ([NSThread isMainThread]) {
        createItem();
    } else {
        dispatch_sync(dispatch_get_main_queue(), createItem);
    }
}

bool IsDarkMenuBar() {
    EnsureStatusItem();
    return g_isDark;
}

void StartObserving(std::function<void(bool)> callback) {
    // No-op - observation happens automatically now
    NSLog(@"[MenuBarAppearance] StartObserving called (automatic observation active)");
}

void StopObserving() {
    // No-op
}

void Initialize() {
    EnsureStatusItem();
}

void Cleanup() {
    if (g_appearanceItem) {
        if (g_observer) {
            @try {
                [g_appearanceItem removeObserver:g_observer forKeyPath:@"button.effectiveAppearance"];
            } @catch (NSException *e) {
                // Ignore
            }
            g_observer = nil;
        }
        [[NSStatusBar systemStatusBar] removeStatusItem:g_appearanceItem];
        g_appearanceItem = nil;
        g_creationTime = nil;
        g_stabilized = false;
        g_consecutiveReadings = 0;
        g_lastReading = YES;
        g_isDark = YES;  // Reset to default
        NSLog(@"[MenuBarAppearance] Cleaned up");
    }
}

} // namespace menu_bar_appearance
