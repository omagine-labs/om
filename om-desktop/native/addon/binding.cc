#include <napi.h>
#include "screen_recorder.h"

// Start recording
Napi::Value StartRecording(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Wrong number of arguments. Expected: displayID, windowID, outputPath")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsString()) {
    Napi::TypeError::New(env, "Wrong argument types. Expected: (number, number, string)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  // Extract arguments
  uint32_t displayID = info[0].As<Napi::Number>().Uint32Value();
  uint32_t windowID = info[1].As<Napi::Number>().Uint32Value();
  std::string outputPath = info[2].As<Napi::String>().Utf8Value();

  // Call native function
  std::string error;
  bool success = screen_recorder::StartRecording(displayID, windowID, outputPath, error);

  // Return result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("success", Napi::Boolean::New(env, success));

  if (!success) {
    result.Set("error", Napi::String::New(env, error));
  }

  return result;
}

// Stop recording
Napi::Value StopRecording(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Call native function
  std::string error;
  std::string filePath = screen_recorder::StopRecording(error);

  // Return result object
  Napi::Object result = Napi::Object::New(env);
  result.Set("success", Napi::Boolean::New(env, !filePath.empty()));

  if (!filePath.empty()) {
    result.Set("filePath", Napi::String::New(env, filePath));
  } else {
    result.Set("error", Napi::String::New(env, error));
  }

  return result;
}

// Check if recording
Napi::Value IsRecording(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool recording = screen_recorder::IsRecording();
  return Napi::Boolean::New(env, recording);
}

// Pause microphone capture (for mic probe detection)
Napi::Value PauseMicCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  bool success = screen_recorder::PauseMicCapture(error);

  Napi::Object result = Napi::Object::New(env);
  result.Set("success", Napi::Boolean::New(env, success));

  if (!success) {
    result.Set("error", Napi::String::New(env, error));
  }

  return result;
}

// Resume microphone capture
Napi::Value ResumeMicCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string error;
  bool success = screen_recorder::ResumeMicCapture(error);

  Napi::Object result = Napi::Object::New(env);
  result.Set("success", Napi::Boolean::New(env, success));

  if (!success) {
    result.Set("error", Napi::String::New(env, error));
  }

  return result;
}

// Check if microphone capture is paused
Napi::Value IsMicCapturePaused(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool paused = screen_recorder::IsMicCapturePaused();
  return Napi::Boolean::New(env, paused);
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startRecording", Napi::Function::New(env, StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
  exports.Set("isRecording", Napi::Function::New(env, IsRecording));
  exports.Set("pauseMicCapture", Napi::Function::New(env, PauseMicCapture));
  exports.Set("resumeMicCapture", Napi::Function::New(env, ResumeMicCapture));
  exports.Set("isMicCapturePaused", Napi::Function::New(env, IsMicCapturePaused));
  return exports;
}

NODE_API_MODULE(screen_recorder, Init)
