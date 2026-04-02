#ifndef SCREEN_RECORDER_H
#define SCREEN_RECORDER_H

#include <string>

namespace screen_recorder {

// Start recording
// Returns true on success, false on failure
bool StartRecording(uint32_t displayID, uint32_t windowID, const std::string& outputPath, std::string& error);

// Stop recording
// Returns the output path on success, empty string on failure
std::string StopRecording(std::string& error);

// Check if currently recording
bool IsRecording();

// Pause microphone capture (for mic probe detection)
// Returns true on success, false on failure
bool PauseMicCapture(std::string& error);

// Resume microphone capture
// Returns true on success, false on failure
bool ResumeMicCapture(std::string& error);

// Check if microphone capture is currently paused
bool IsMicCapturePaused();

} // namespace screen_recorder

#endif // SCREEN_RECORDER_H
