#ifndef WINDOW_DETECTOR_H
#define WINDOW_DETECTOR_H

#include <string>
#include <vector>

namespace window_detector {

struct WindowBounds {
  int x;
  int y;
  int width;
  int height;
};

struct MeetingWindow {
  std::string platform;     // "zoom", "meet", "teams", "slack", or empty
  uint32_t windowId;        // CGWindowID for ScreenCaptureKit
  std::string windowTitle;  // Full window title
  std::string appName;      // Owning application name
  std::string url;          // Tab URL for browser-based meetings (optional)
  WindowBounds bounds;      // Window position and size
};

// Get the currently active meeting window (if any)
// Returns true if a meeting window is found, false otherwise
bool GetActiveMeetingWindow(MeetingWindow& window, std::string& error);

// Get all open meeting windows
std::vector<MeetingWindow> GetAllMeetingWindows(std::string& error);

// Check if a specific window ID is still active
bool IsWindowActive(uint32_t windowId);

// Get all tab URLs for a specific browser window
// Returns empty vector if window is not a supported browser or if there's an error
std::vector<std::string> GetWindowTabURLs(uint32_t windowId, std::string& error);

// ============================================================================
// Microphone-based meeting detection
// ============================================================================

// Check if any microphone (audio input device) is currently in use
// Returns true if microphone is active, false otherwise
bool IsMicrophoneInUse(std::string& error);

// Information about a running meeting app
struct MeetingAppInfo {
  std::string appName;      // Display name (e.g., "Slack", "zoom.us")
  std::string bundleId;     // Bundle identifier
  std::string platform;     // Normalized platform ("slack", "zoom", "teams", "meet", "browser")
  int pid;                  // Process ID
  bool hasVisibleWindow;    // Whether the app has a visible window
};

// Get list of known meeting apps that are currently running
// This checks for apps like Slack, Zoom, Teams, browsers, etc.
std::vector<MeetingAppInfo> GetRunningMeetingApps(std::string& error);

// High-level detection: Check if there's an active meeting
// Returns true if microphone is in use AND a known meeting app is running
// Also populates meetingApp with info about the detected meeting app
bool IsInMeeting(MeetingAppInfo& meetingApp, std::string& error);

} // namespace window_detector

#endif // WINDOW_DETECTOR_H
