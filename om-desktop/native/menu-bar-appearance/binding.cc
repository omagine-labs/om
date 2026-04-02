#include <napi.h>
#include "menu_bar_appearance.h"

// Thread-safe function for callbacks from native code to JavaScript
static Napi::ThreadSafeFunction g_tsfn;
static bool g_tsfnInitialized = false;

// Check if menu bar is dark
Napi::Value IsDarkMenuBar(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool isDark = menu_bar_appearance::IsDarkMenuBar();
  return Napi::Boolean::New(env, isDark);
}

// Callback data structure
struct AppearanceCallbackData {
  bool isDark;
};

// Start observing appearance changes
Napi::Value StartObserving(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Callback function required")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function callback = info[0].As<Napi::Function>();

  // Create thread-safe function
  g_tsfn = Napi::ThreadSafeFunction::New(
      env,
      callback,
      "MenuBarAppearanceCallback",
      0,  // Unlimited queue
      1,  // Initial thread count
      [](Napi::Env) {
        // Release callback - stop observing
        menu_bar_appearance::StopObserving();
        g_tsfnInitialized = false;
      });

  g_tsfnInitialized = true;

  // Start native observation with callback
  menu_bar_appearance::StartObserving([](bool isDark) {
    if (!g_tsfnInitialized) return;

    // Create callback data
    auto* data = new AppearanceCallbackData{isDark};

    // Call JavaScript callback on the main thread
    napi_status status = g_tsfn.BlockingCall(data, [](Napi::Env env, Napi::Function jsCallback, AppearanceCallbackData* data) {
      if (data) {
        jsCallback.Call({Napi::Boolean::New(env, data->isDark)});
        delete data;
      }
    });

    if (status != napi_ok) {
      delete data;
    }
  });

  return env.Undefined();
}

// Stop observing appearance changes
Napi::Value StopObserving(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (g_tsfnInitialized) {
    g_tsfn.Release();
    g_tsfnInitialized = false;
  }

  menu_bar_appearance::StopObserving();

  return env.Undefined();
}

// Initialize the appearance observer
Napi::Value Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  menu_bar_appearance::Initialize();
  return env.Undefined();
}

// Cleanup resources
Napi::Value Cleanup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (g_tsfnInitialized) {
    g_tsfn.Release();
    g_tsfnInitialized = false;
  }

  menu_bar_appearance::Cleanup();

  return env.Undefined();
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isDarkMenuBar", Napi::Function::New(env, IsDarkMenuBar));
  exports.Set("startObserving", Napi::Function::New(env, StartObserving));
  exports.Set("stopObserving", Napi::Function::New(env, StopObserving));
  exports.Set("initialize", Napi::Function::New(env, Initialize));
  exports.Set("cleanup", Napi::Function::New(env, Cleanup));
  return exports;
}

NODE_API_MODULE(menu_bar_appearance, Init)
