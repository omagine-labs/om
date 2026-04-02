#include <napi.h>
#include "window_detector.h"

// Get active meeting window
Napi::Value GetActiveMeetingWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  window_detector::MeetingWindow window;
  std::string error;

  bool found = window_detector::GetActiveMeetingWindow(window, error);

  if (!found) {
    // Return null if no meeting window found
    return env.Null();
  }

  // Create result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("platform", Napi::String::New(env, window.platform));
  result.Set("windowId", Napi::Number::New(env, window.windowId));
  result.Set("windowTitle", Napi::String::New(env, window.windowTitle));
  result.Set("appName", Napi::String::New(env, window.appName));

  if (!window.url.empty()) {
    result.Set("url", Napi::String::New(env, window.url));
  }

  // Add bounds
  Napi::Object bounds = Napi::Object::New(env);
  bounds.Set("x", Napi::Number::New(env, window.bounds.x));
  bounds.Set("y", Napi::Number::New(env, window.bounds.y));
  bounds.Set("width", Napi::Number::New(env, window.bounds.width));
  bounds.Set("height", Napi::Number::New(env, window.bounds.height));
  result.Set("bounds", bounds);

  return result;
}

// Get all meeting windows
Napi::Value GetAllMeetingWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  std::vector<window_detector::MeetingWindow> windows =
      window_detector::GetAllMeetingWindows(error);

  // Create array
  Napi::Array result = Napi::Array::New(env, windows.size());

  for (size_t i = 0; i < windows.size(); i++) {
    const auto& window = windows[i];

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("platform", Napi::String::New(env, window.platform));
    obj.Set("windowId", Napi::Number::New(env, window.windowId));
    obj.Set("windowTitle", Napi::String::New(env, window.windowTitle));
    obj.Set("appName", Napi::String::New(env, window.appName));

    if (!window.url.empty()) {
      obj.Set("url", Napi::String::New(env, window.url));
    }

    // Add bounds
    Napi::Object bounds = Napi::Object::New(env);
    bounds.Set("x", Napi::Number::New(env, window.bounds.x));
    bounds.Set("y", Napi::Number::New(env, window.bounds.y));
    bounds.Set("width", Napi::Number::New(env, window.bounds.width));
    bounds.Set("height", Napi::Number::New(env, window.bounds.height));
    obj.Set("bounds", bounds);

    result[i] = obj;
  }

  return result;
}

// Check if window is active
Napi::Value IsWindowActive(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window ID (number) required")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  bool active = window_detector::IsWindowActive(windowId);

  return Napi::Boolean::New(env, active);
}

// Get all tab URLs for a specific window
Napi::Value GetWindowTabURLs(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window ID (number) required")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  std::string error;
  std::vector<std::string> urls = window_detector::GetWindowTabURLs(windowId, error);

  // Create array
  Napi::Array result = Napi::Array::New(env, urls.size());

  for (size_t i = 0; i < urls.size(); i++) {
    result[i] = Napi::String::New(env, urls[i]);
  }

  return result;
}

// Check if microphone is in use
Napi::Value IsMicrophoneInUse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  bool inUse = window_detector::IsMicrophoneInUse(error);

  return Napi::Boolean::New(env, inUse);
}

// Get running meeting apps
Napi::Value GetRunningMeetingApps(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  std::vector<window_detector::MeetingAppInfo> apps =
      window_detector::GetRunningMeetingApps(error);

  Napi::Array result = Napi::Array::New(env, apps.size());

  for (size_t i = 0; i < apps.size(); i++) {
    const auto& app = apps[i];

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("appName", Napi::String::New(env, app.appName));
    obj.Set("bundleId", Napi::String::New(env, app.bundleId));
    obj.Set("platform", Napi::String::New(env, app.platform));
    obj.Set("pid", Napi::Number::New(env, app.pid));
    obj.Set("hasVisibleWindow", Napi::Boolean::New(env, app.hasVisibleWindow));

    result[i] = obj;
  }

  return result;
}

// Check if currently in a meeting (mic in use + meeting app running)
Napi::Value IsInMeeting(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  window_detector::MeetingAppInfo meetingApp;
  bool inMeeting = window_detector::IsInMeeting(meetingApp, error);

  if (!inMeeting) {
    return env.Null();
  }

  // Return meeting app info
  Napi::Object result = Napi::Object::New(env);
  result.Set("appName", Napi::String::New(env, meetingApp.appName));
  result.Set("bundleId", Napi::String::New(env, meetingApp.bundleId));
  result.Set("platform", Napi::String::New(env, meetingApp.platform));
  result.Set("pid", Napi::Number::New(env, meetingApp.pid));
  result.Set("hasVisibleWindow", Napi::Boolean::New(env, meetingApp.hasVisibleWindow));

  return result;
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getActiveMeetingWindow",
              Napi::Function::New(env, GetActiveMeetingWindow));
  exports.Set("getAllMeetingWindows",
              Napi::Function::New(env, GetAllMeetingWindows));
  exports.Set("isWindowActive",
              Napi::Function::New(env, IsWindowActive));
  exports.Set("getWindowTabURLs",
              Napi::Function::New(env, GetWindowTabURLs));
  // New microphone-based detection
  exports.Set("isMicrophoneInUse",
              Napi::Function::New(env, IsMicrophoneInUse));
  exports.Set("getRunningMeetingApps",
              Napi::Function::New(env, GetRunningMeetingApps));
  exports.Set("isInMeeting",
              Napi::Function::New(env, IsInMeeting));
  return exports;
}

NODE_API_MODULE(window_detector, Init)
