#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreAudio/CoreAudio.h>
#include "window_detector.h"
#include <unordered_set>
#include <unordered_map>
#include <vector>

namespace window_detector {

// Helper function to check if a string contains a substring (case-insensitive)
static bool ContainsIgnoreCase(const std::string& str, const std::string& substr) {
  NSString* nsStr = [NSString stringWithUTF8String:str.c_str()];
  NSString* nsSubstr = [NSString stringWithUTF8String:substr.c_str()];
  return [nsStr rangeOfString:nsSubstr options:NSCaseInsensitiveSearch].location != NSNotFound;
}

// Helper function to check if a Teams window is a non-meeting window
// Teams non-meeting windows start with prefixes like "Chat | ", "Calendar | ", etc.
// These windows should NOT be detected as meetings even if they contain "Call" or "Meeting"
static bool IsTeamsNonMeetingWindow(const std::string& windowTitle) {
  // Teams non-meeting prefixes - these windows are never meetings
  // Format: "Chat | ...", "Calendar | ...", etc.
  static const char* NON_MEETING_PREFIXES[] = {
    "Chat | ",
    "Calendar | ",
    "Activity | ",
    "Teams | ",
    "Files | ",
    "Apps | "
  };
  static const size_t NUM_PREFIXES = sizeof(NON_MEETING_PREFIXES) / sizeof(NON_MEETING_PREFIXES[0]);

  NSString* nsTitle = [NSString stringWithUTF8String:windowTitle.c_str()];
  if (!nsTitle) return false;

  for (size_t i = 0; i < NUM_PREFIXES; i++) {
    NSString* nsPrefix = [NSString stringWithUTF8String:NON_MEETING_PREFIXES[i]];
    if ([nsTitle hasPrefix:nsPrefix]) {
      return true;  // This is a non-meeting window
    }
  }
  return false;
}

// Detect meeting platform from window title and URL
static std::string DetectMeetingPlatform(const std::string& windowTitle,
                                         const std::string& appName,
                                         const std::string& url) {
  // Zoom - detect by window title
  if (ContainsIgnoreCase(windowTitle, "Zoom Meeting")) {
    return "zoom";
  }

  // Google Meet - detect by window title
  // Matches both ad-hoc meetings: "Meet - abc-defg-hij"
  // And planned meetings: "Meet - <meeting title>"
  // Use NSString for proper Unicode handling instead of std::string::substr
  NSString* nsTitle = [NSString stringWithUTF8String:windowTitle.c_str()];
  if (nsTitle && [nsTitle length] >= 7) {
    NSString* prefix = [nsTitle substringToIndex:7];
    NSString* target = @"Meet - ";
    if ([prefix caseInsensitiveCompare:target] == NSOrderedSame) {
      return "meet";
    }
  }

  // Microsoft Teams - detect by app name (like Slack)
  // Supports both "Microsoft Teams" and just "Teams" (for Teams 2.0)
  if (ContainsIgnoreCase(appName, "Teams")) {
    // Skip non-meeting windows (Chat, Calendar, Activity, etc.)
    // These windows can have "Call" or "Meeting" in chat/channel names but aren't actual meetings
    if (IsTeamsNonMeetingWindow(windowTitle)) {
      return "";  // Not a meeting
    }
    if (ContainsIgnoreCase(windowTitle, "Meeting") ||
        ContainsIgnoreCase(windowTitle, "Call")) {
      return "teams";
    }
  }

  // Slack - detect by window title
  if (ContainsIgnoreCase(appName, "Slack")) {
    if (ContainsIgnoreCase(windowTitle, "Huddle") ||
        ContainsIgnoreCase(windowTitle, "Call")) {
      return "slack";
    }
  }

  return "";
}

// Get window information from CGWindowID
static bool GetWindowInfo(CGWindowID windowId,
                          std::string& windowTitle,
                          std::string& ownerName,
                          int& layer) {
  @autoreleasepool {
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionIncludingWindow,
      windowId
    );

    if (!windowList || CFArrayGetCount(windowList) == 0) {
      if (windowList) CFRelease(windowList);
      return false;
    }

    CFDictionaryRef window = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, 0);

    // Get window title
    CFStringRef title = (CFStringRef)CFDictionaryGetValue(window, kCGWindowName);
    if (title) {
      const char* titleStr = CFStringGetCStringPtr(title, kCFStringEncodingUTF8);
      if (titleStr) {
        windowTitle = std::string(titleStr);
      } else {
        // Fallback for when CFStringGetCStringPtr returns NULL
        CFIndex length = CFStringGetLength(title);
        CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
        std::vector<char> buffer(maxSize);
        if (CFStringGetCString(title, buffer.data(), maxSize, kCFStringEncodingUTF8)) {
          windowTitle = std::string(buffer.data());
        }
      }
    }

    // Get owner name
    CFStringRef owner = (CFStringRef)CFDictionaryGetValue(window, kCGWindowOwnerName);
    if (owner) {
      const char* ownerStr = CFStringGetCStringPtr(owner, kCFStringEncodingUTF8);
      if (ownerStr) {
        ownerName = std::string(ownerStr);
      } else {
        CFIndex length = CFStringGetLength(owner);
        CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
        std::vector<char> buffer(maxSize);
        if (CFStringGetCString(owner, buffer.data(), maxSize, kCFStringEncodingUTF8)) {
          ownerName = std::string(buffer.data());
        }
      }
    }

    // Get layer
    CFNumberRef layerNum = (CFNumberRef)CFDictionaryGetValue(window, kCGWindowLayer);
    if (layerNum) {
      CFNumberGetValue(layerNum, kCFNumberIntType, &layer);
    }

    CFRelease(windowList);
    return true;
  }
}

bool GetActiveMeetingWindow(MeetingWindow& window, std::string& error) {
  @autoreleasepool {
    // Note: No Accessibility permission check needed
    // CGWindowList APIs work with Screen Recording permission
    // AppleScript for tab URLs works with Apple Events permission (in entitlements)

    // Get list of all windows
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID
    );

    if (!windowList) {
      error = "Failed to get window list";
      return false;
    }

    CFIndex windowCount = CFArrayGetCount(windowList);
    bool foundMeeting = false;

    // Find the frontmost meeting window
    for (CFIndex i = 0; i < windowCount; i++) {
      CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

      // Get window ID
      CFNumberRef windowIdRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowNumber);
      if (!windowIdRef) continue;

      uint32_t windowId;
      CFNumberGetValue(windowIdRef, kCFNumberIntType, &windowId);

      // Get window layer (0 = normal window)
      CFNumberRef layerRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowLayer);
      int layer = 0;
      if (layerRef) {
        CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
      }

      // Skip non-normal windows
      if (layer != 0) continue;

      std::string windowTitle, ownerName;
      int windowLayer;
      if (!GetWindowInfo(windowId, windowTitle, ownerName, windowLayer)) {
        continue;
      }

      // Detect platform (URL-based detection removed - rely on window title only)
      std::string platform = DetectMeetingPlatform(windowTitle, ownerName, "");

      if (!platform.empty()) {
        // Get window bounds
        CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(windowInfo, kCGWindowBounds);
        if (boundsDict) {
          CGRect bounds;
          CGRectMakeWithDictionaryRepresentation(boundsDict, &bounds);
          window.bounds.x = static_cast<int>(bounds.origin.x);
          window.bounds.y = static_cast<int>(bounds.origin.y);
          window.bounds.width = static_cast<int>(bounds.size.width);
          window.bounds.height = static_cast<int>(bounds.size.height);
        } else {
          // Default to zero if bounds not available
          window.bounds.x = 0;
          window.bounds.y = 0;
          window.bounds.width = 0;
          window.bounds.height = 0;
        }

        window.platform = platform;
        window.windowId = windowId;
        window.windowTitle = windowTitle;
        window.appName = ownerName;
        window.url = ""; // URL-based detection removed
        foundMeeting = true;
        break; // Found the frontmost meeting
      }
    }

    CFRelease(windowList);

    if (!foundMeeting) {
      error = "No meeting window detected";
      return false;
    }

    return true;
  }
}

std::vector<MeetingWindow> GetAllMeetingWindows(std::string& error) {
  std::vector<MeetingWindow> meetings;

  @autoreleasepool {
    // Note: No Accessibility permission check needed
    // CGWindowList APIs work with Screen Recording permission
    // AppleScript for tab URLs works with Apple Events permission (in entitlements)

    // Use kCGWindowListOptionAll (0) instead of kCGWindowListOptionOnScreenOnly
    // to include windows from ALL macOS Spaces, not just the current one.
    // This is important for detecting meeting windows when the user switches Spaces.
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListExcludeDesktopElements,
      kCGNullWindowID
    );

    if (!windowList) {
      error = "Failed to get window list";
      return meetings;
    }

    CFIndex windowCount = CFArrayGetCount(windowList);

    for (CFIndex i = 0; i < windowCount; i++) {
      CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

      CFNumberRef windowIdRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowNumber);
      if (!windowIdRef) continue;

      uint32_t windowId;
      CFNumberGetValue(windowIdRef, kCFNumberIntType, &windowId);

      std::string windowTitle, ownerName;
      int windowLayer;
      if (!GetWindowInfo(windowId, windowTitle, ownerName, windowLayer)) {
        continue;
      }

      if (windowLayer != 0) continue;

      // Detect platform (URL-based detection removed - rely on window title only)
      std::string platform = DetectMeetingPlatform(windowTitle, ownerName, "");

      if (!platform.empty()) {
        MeetingWindow window;

        // Get window bounds
        CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(windowInfo, kCGWindowBounds);
        if (boundsDict) {
          CGRect bounds;
          CGRectMakeWithDictionaryRepresentation(boundsDict, &bounds);
          window.bounds.x = static_cast<int>(bounds.origin.x);
          window.bounds.y = static_cast<int>(bounds.origin.y);
          window.bounds.width = static_cast<int>(bounds.size.width);
          window.bounds.height = static_cast<int>(bounds.size.height);
        } else {
          window.bounds.x = 0;
          window.bounds.y = 0;
          window.bounds.width = 0;
          window.bounds.height = 0;
        }

        window.platform = platform;
        window.windowId = windowId;
        window.windowTitle = windowTitle;
        window.appName = ownerName;
        window.url = ""; // URL-based detection removed
        meetings.push_back(window);
      }
    }

    CFRelease(windowList);
  }

  return meetings;
}

bool IsWindowActive(uint32_t windowId) {
  @autoreleasepool {
    CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionIncludingWindow,
      windowId
    );

    if (!windowList || CFArrayGetCount(windowList) == 0) {
      if (windowList) CFRelease(windowList);
      return false;
    }

    CFRelease(windowList);
    return true;
  }
}

std::vector<std::string> GetWindowTabURLs(uint32_t windowId, std::string& error) {
  std::vector<std::string> urls;

  @autoreleasepool {
    // When windowId=0, we get tabs from all browsers (used for meeting detection)
    // Otherwise, get tabs from a specific window
    std::string ownerName;

    if (windowId != 0) {
      // Get window info to determine the app name
      std::string windowTitle;
      int layer;
      if (!GetWindowInfo(windowId, windowTitle, ownerName, layer)) {
        error = "Failed to get window info";
        return urls;
      }

      // Check if this is a supported browser
      std::unordered_set<std::string> browsers = {
        "Google Chrome", "Brave Browser", "Safari"
      };

      if (browsers.find(ownerName) == browsers.end()) {
        error = "Window is not a supported browser";
        return urls;
      }
    }

    // When windowId=0, try all browsers; otherwise use the specific browser
    NSArray<NSString*>* browsersToTry;
    if (windowId == 0) {
      // Try all supported browsers
      browsersToTry = @[@"Google Chrome", @"Brave Browser", @"Safari"];
    } else {
      // Use the specific browser from the window
      browsersToTry = @[[NSString stringWithUTF8String:ownerName.c_str()]];
    }

    // Try each browser and collect URLs
    for (NSString* browserName in browsersToTry) {
      // Check if this browser is actually running before querying it
      NSArray<NSRunningApplication*>* runningApps = [[NSWorkspace sharedWorkspace] runningApplications];
      bool browserIsRunning = false;
      for (NSRunningApplication* app in runningApps) {
        if ([app.localizedName isEqualToString:browserName]) {
          browserIsRunning = true;
          break;
        }
      }

      if (!browserIsRunning) {
        continue; // Skip this browser if it's not running
      }

      NSString* scriptSource = nil;

      // Get ALL windows and ALL their tabs
      if ([browserName isEqualToString:@"Google Chrome"]) {
        scriptSource = @"tell application \"Google Chrome\"\n"
                       @"  set allURLs to {}\n"
                       @"  repeat with w in windows\n"
                       @"    repeat with t in tabs of w\n"
                       @"      set end of allURLs to URL of t\n"
                       @"    end repeat\n"
                       @"  end repeat\n"
                       @"  return allURLs\n"
                       @"end tell";
      } else if ([browserName isEqualToString:@"Brave Browser"]) {
        scriptSource = @"tell application \"Brave Browser\"\n"
                       @"  set allURLs to {}\n"
                       @"  repeat with w in windows\n"
                       @"    repeat with t in tabs of w\n"
                       @"      set end of allURLs to URL of t\n"
                       @"    end repeat\n"
                       @"  end repeat\n"
                       @"  return allURLs\n"
                       @"end tell";
      } else if ([browserName isEqualToString:@"Safari"]) {
        scriptSource = @"tell application \"Safari\"\n"
                       @"  set allURLs to {}\n"
                       @"  repeat with w in windows\n"
                       @"    repeat with t in tabs of w\n"
                       @"      set end of allURLs to URL of t\n"
                       @"    end repeat\n"
                       @"  end repeat\n"
                       @"  return allURLs\n"
                       @"end tell";
      }

      if (scriptSource) {
        NSAppleScript* script = [[NSAppleScript alloc] initWithSource:scriptSource];
        NSDictionary* errorDict = nil;
        NSAppleEventDescriptor* result = [script executeAndReturnError:&errorDict];

        if (result && !errorDict) {
          NSInteger count = [result numberOfItems];
          for (NSInteger i = 1; i <= count; i++) {
            NSAppleEventDescriptor* item = [result descriptorAtIndex:i];
            NSString* url = [item stringValue];
            if (url) {
              urls.push_back(std::string([url UTF8String]));
            }
          }
        }
      }
    }

    if (urls.empty()) {
      error = "No tabs found or browser not accessible";
    }
  }

  return urls;
}

// ============================================================================
// Microphone-based meeting detection
// ============================================================================

// Known meeting app bundle IDs mapped to platform names
// "browser" is a special case - needs additional URL checking
static const std::unordered_map<std::string, std::string> MEETING_APP_BUNDLES = {
  {"com.tinyspeck.slackmacgap", "slack"},
  {"us.zoom.xos", "zoom"},
  {"com.microsoft.teams", "teams"},
  {"com.microsoft.teams2", "teams"},
  {"com.google.Chrome", "browser"},
  {"com.brave.Browser", "browser"},
  {"com.apple.Safari", "browser"},
  {"com.microsoft.edgemac", "browser"},
  {"org.mozilla.firefox", "browser"},
};

bool IsMicrophoneInUse(std::string& error) {
  @autoreleasepool {
    // Get ALL audio devices (not just the default)
    // This matches macOS orange microphone indicator behavior
    AudioObjectPropertyAddress devicesAddress = {
      kAudioHardwarePropertyDevices,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain
    };

    UInt32 dataSize = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(
      kAudioObjectSystemObject,
      &devicesAddress,
      0,
      NULL,
      &dataSize
    );

    if (status != noErr || dataSize == 0) {
      error = "Failed to get audio devices size";
      return false;
    }

    int deviceCount = dataSize / sizeof(AudioDeviceID);
    std::vector<AudioDeviceID> devices(deviceCount);

    status = AudioObjectGetPropertyData(
      kAudioObjectSystemObject,
      &devicesAddress,
      0,
      NULL,
      &dataSize,
      devices.data()
    );

    if (status != noErr) {
      error = "Failed to get audio devices";
      return false;
    }

    // Check each device to see if it's an input device that's in use
    for (AudioDeviceID device : devices) {
      // Check if device has input streams (i.e., is a microphone)
      AudioObjectPropertyAddress streamsAddress = {
        kAudioDevicePropertyStreams,
        kAudioDevicePropertyScopeInput,
        kAudioObjectPropertyElementMain
      };

      UInt32 streamsSize = 0;
      status = AudioObjectGetPropertyDataSize(
        device,
        &streamsAddress,
        0,
        NULL,
        &streamsSize
      );

      if (status != noErr || streamsSize == 0) {
        continue; // Not an input device, skip
      }

      // This is an input device - check if it's in use
      AudioObjectPropertyAddress runningAddress = {
        kAudioDevicePropertyDeviceIsRunningSomewhere,
        kAudioObjectPropertyScopeInput,
        kAudioObjectPropertyElementMain
      };

      UInt32 isRunning = 0;
      UInt32 runningSize = sizeof(isRunning);

      status = AudioObjectGetPropertyData(
        device,
        &runningAddress,
        0,
        NULL,
        &runningSize,
        &isRunning
      );

      if (status == noErr && isRunning != 0) {
        return true; // At least one microphone is in use
      }
    }

    return false; // No microphones in use
  }
}

std::vector<MeetingAppInfo> GetRunningMeetingApps(std::string& error) {
  std::vector<MeetingAppInfo> apps;

  @autoreleasepool {
    // Get all running applications
    NSArray<NSRunningApplication*>* runningApps = [[NSWorkspace sharedWorkspace] runningApplications];

    for (NSRunningApplication* app in runningApps) {
      NSString* bundleId = app.bundleIdentifier;
      NSString* appName = app.localizedName;

      if (!bundleId || !appName) continue;

      std::string bundleIdStr = [bundleId UTF8String];
      auto it = MEETING_APP_BUNDLES.find(bundleIdStr);

      if (it != MEETING_APP_BUNDLES.end()) {
        // This is a known meeting app
        MeetingAppInfo info;
        info.appName = [appName UTF8String];
        info.bundleId = bundleIdStr;
        info.platform = it->second;
        info.pid = app.processIdentifier;
        info.hasVisibleWindow = !app.isHidden && !app.isTerminated;

        apps.push_back(info);
      }
    }
  }

  return apps;
}

// Check if an app is likely in a meeting by examining its windows
// For apps like Slack that are always running, we need more than just "visible"
static bool IsAppLikelyInMeeting(const std::string& bundleId, pid_t pid) {
  @autoreleasepool {
    // For Zoom, check if there's an actual meeting window (not just the main Zoom window)
    // Zoom keeps its window open after meetings end, so we need to check the title
    if (bundleId == "us.zoom.xos") {
      CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
      );

      if (!windowList) return false;

      bool hasMeetingWindow = false;
      CFIndex count = CFArrayGetCount(windowList);

      for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

        // Check if this window belongs to Zoom
        CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowOwnerPID);
        if (!pidRef) continue;

        pid_t windowPid;
        CFNumberGetValue(pidRef, kCFNumberIntType, &windowPid);
        if (windowPid != pid) continue;

        // Get window title
        CFStringRef title = (CFStringRef)CFDictionaryGetValue(windowInfo, kCGWindowName);
        if (!title) continue;

        NSString* nsTitle = (__bridge NSString*)title;

        // Zoom meeting windows have "Zoom Meeting" in the title
        // The main Zoom window just says "Zoom" or "Zoom Workplace"
        if ([nsTitle containsString:@"Zoom Meeting"]) {
          hasMeetingWindow = true;
          break;
        }
      }

      CFRelease(windowList);
      return hasMeetingWindow;
    }

    // For Teams, check if there's an actual meeting window
    if (bundleId == "com.microsoft.teams" || bundleId == "com.microsoft.teams2") {
      CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
      );

      if (!windowList) return false;

      bool hasMeetingWindow = false;
      CFIndex count = CFArrayGetCount(windowList);

      for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

        // Check if this window belongs to Teams
        CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowOwnerPID);
        if (!pidRef) continue;

        pid_t windowPid;
        CFNumberGetValue(pidRef, kCFNumberIntType, &windowPid);
        if (windowPid != pid) continue;

        // Get window title
        CFStringRef title = (CFStringRef)CFDictionaryGetValue(windowInfo, kCGWindowName);
        if (!title) continue;

        NSString* nsTitle = (__bridge NSString*)title;

        // Skip non-meeting windows (Chat, Calendar, Activity, etc.)
        // These windows can have "Call" or "Meeting" in chat/channel names but aren't actual meetings
        std::string titleStr = [nsTitle UTF8String] ?: "";
        if (IsTeamsNonMeetingWindow(titleStr)) {
          continue;  // Skip this window, check other windows
        }

        // Teams meeting/call windows contain "Meeting" or "Call" in the title
        if ([nsTitle containsString:@"Meeting"] || [nsTitle containsString:@"Call"]) {
          hasMeetingWindow = true;
          break;
        }
      }

      CFRelease(windowList);
      return hasMeetingWindow;
    }

    // For Slack, check window titles for huddle/call indicators
    // Slack is often running but not in a call
    if (bundleId == "com.tinyspeck.slackmacgap") {
      CFArrayRef windowList = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
      );

      if (!windowList) return false;

      bool hasHuddleWindow = false;
      CFIndex count = CFArrayGetCount(windowList);

      for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

        // Check if this window belongs to Slack
        CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowOwnerPID);
        if (!pidRef) continue;

        pid_t windowPid;
        CFNumberGetValue(pidRef, kCFNumberIntType, &windowPid);
        if (windowPid != pid) continue;

        // Get window title
        CFStringRef title = (CFStringRef)CFDictionaryGetValue(windowInfo, kCGWindowName);
        if (!title) continue;

        NSString* nsTitle = (__bridge NSString*)title;

        // Slack huddle windows contain emoji indicators or "Huddle" text
        // The emojis appear as part of the channel/workspace indicator when in a huddle
        // Example: "general (Channel) - Chip - Slack [Main] 🏠🎤"
        // 🎤 (U+1F3A4) is the microphone emoji Slack uses for huddles
        if ([nsTitle containsString:@"Huddle"] ||
            [nsTitle containsString:@"huddle"] ||
            [nsTitle containsString:@"🎤"] ||      // U+1F3A4 microphone (what Slack actually uses)
            [nsTitle containsString:@"🎙"] ||      // U+1F399 studio microphone
            [nsTitle containsString:@"🎧"] ||      // U+1F3A7 headphones
            [nsTitle containsString:@"\U0001F3A4"] ||  // 🎤 microphone (escaped)
            [nsTitle containsString:@"\U0001F399"] ||  // 🎙 studio microphone (escaped)
            [nsTitle containsString:@"\U0001F3A7"]) {  // 🎧 headphones (escaped)
          hasHuddleWindow = true;
          break;
        }
      }

      CFRelease(windowList);
      return hasHuddleWindow;
    }

    // For browsers, we can't easily tell - let TypeScript layer handle URL checking
    return true;
  }
}

bool IsInMeeting(MeetingAppInfo& meetingApp, std::string& error) {
  // Step 1: Check if microphone is in use
  bool micInUse = IsMicrophoneInUse(error);
  if (!micInUse) {
    return false;
  }

  // Step 2: Check if any known meeting app is running and likely in a meeting
  std::vector<MeetingAppInfo> runningApps = GetRunningMeetingApps(error);

  // First pass: Check native meeting apps (Slack, Zoom, Teams, etc.)
  // These take priority because we can verify if they're actually in a meeting
  for (const auto& app : runningApps) {
    if (app.platform != "browser" && app.hasVisibleWindow) {
      if (IsAppLikelyInMeeting(app.bundleId, app.pid)) {
        meetingApp = app;
        return true;
      }
    }
  }

  // Second pass: Check browsers
  // We get here if no native app is confirmed to be in a meeting
  // (e.g., Slack is running but not in a huddle)
  // IMPORTANT: Only return true if we can actually find a meeting URL open
  for (const auto& app : runningApps) {
    if (app.platform == "browser" && app.hasVisibleWindow) {
      // Get all open tabs for this browser to check for meeting URLs
      std::string urlError;
      std::vector<std::string> urls = GetWindowTabURLs(0, urlError); // windowId=0 gets all tabs

      // Check if any tab contains a meeting URL and determine the platform
      std::string detectedPlatform = "";
      for (const auto& url : urls) {
        NSString* nsURL = [NSString stringWithUTF8String:url.c_str()];

        // Check for Google Meet URLs with actual meeting codes (not just meet.google.com)
        // Valid format: meet.google.com/abc-defg-hij
        if ([nsURL containsString:@"meet.google.com/"]) {
          // Extract path after meet.google.com/
          NSRange range = [nsURL rangeOfString:@"meet.google.com/"];
          if (range.location != NSNotFound) {
            NSString* path = [nsURL substringFromIndex:range.location + range.length];
            // Check if path contains a valid meeting code (at least 3 chars with hyphens)
            // This excludes pages like meet.google.com/new or meet.google.com/
            if ([path length] >= 3 && [path containsString:@"-"]) {
              detectedPlatform = "meet";
              break;
            }
          }
        }

        // Check for Zoom web URLs
        if ([nsURL containsString:@"zoom.us/j/"] || [nsURL containsString:@"zoom.us/wc/join/"]) {
          detectedPlatform = "zoom";
          break;
        }

        // Check for Teams web URLs
        // Supports: teams.microsoft.com (enterprise) and teams.live.com (consumer)
        if (([nsURL containsString:@"teams.microsoft.com"] && [nsURL containsString:@"meetingId="]) ||
            ([nsURL containsString:@"teams.live.com"] && ([nsURL containsString:@"/meet/"] || [nsURL containsString:@"/v2/"]))) {
          detectedPlatform = "teams";
          break;
        }
      }

      if (!detectedPlatform.empty()) {
        meetingApp = app;
        meetingApp.platform = detectedPlatform;
        return true;
      }
    }
  }

  error = "No meeting app detected";
  return false;
}

} // namespace window_detector
