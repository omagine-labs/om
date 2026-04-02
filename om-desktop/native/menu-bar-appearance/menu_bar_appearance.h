#ifndef MENU_BAR_APPEARANCE_H
#define MENU_BAR_APPEARANCE_H

#include <functional>

namespace menu_bar_appearance {

/**
 * Check if the menu bar currently has a dark appearance
 * This uses NSStatusItem.button.effectiveAppearance which correctly
 * detects the actual menu bar appearance, including wallpaper-based tinting
 *
 * @return true if menu bar is dark (needs white icons), false if light
 */
bool IsDarkMenuBar();

/**
 * Start observing menu bar appearance changes via KVO
 * The callback will be called immediately with the current state,
 * and then again whenever the appearance changes
 *
 * @param callback Function to call when appearance changes (true = dark)
 */
void StartObserving(std::function<void(bool)> callback);

/**
 * Stop observing menu bar appearance changes
 * Should be called before app shutdown to clean up observers
 */
void StopObserving();

/**
 * Initialize the appearance observer
 * Creates a hidden NSStatusItem for appearance detection
 * This is called automatically on first use, but can be called explicitly
 */
void Initialize();

/**
 * Cleanup resources
 * Should be called on app shutdown
 */
void Cleanup();

} // namespace menu_bar_appearance

#endif // MENU_BAR_APPEARANCE_H
