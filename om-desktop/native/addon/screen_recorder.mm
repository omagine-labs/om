#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#include "screen_recorder.h"
#include <string>

// Objective-C++ implementation
@interface ScreenRecorderImpl : NSObject <SCStreamDelegate, SCStreamOutput, AVCaptureAudioDataOutputSampleBufferDelegate>
@property (nonatomic, strong) SCStream *stream;
@property (nonatomic, strong) AVAssetWriter *assetWriter;
@property (nonatomic, strong) AVAssetWriterInput *videoInput;
@property (nonatomic, strong) AVAssetWriterInput *audioInput;
@property (nonatomic, strong) AVAssetWriterInput *micAudioInput;
@property (nonatomic, strong) AVAssetWriterInputPixelBufferAdaptor *pixelBufferAdaptor;
@property (nonatomic, assign) BOOL isRecording;
@property (nonatomic, strong) NSURL *outputURL;
@property (nonatomic, assign) BOOL sessionStarted;
@property (nonatomic, assign) CMTime firstVideoTime;
@property (nonatomic, assign) BOOL isRecordingWindow;

// Microphone capture
@property (nonatomic, strong) AVCaptureSession *micSession;
@property (nonatomic, strong) AVCaptureAudioDataOutput *micOutput;
@property (nonatomic, strong) dispatch_queue_t micQueue;
@property (nonatomic, assign) CMTime firstMicTime;
@property (nonatomic, assign) BOOL micTimeInitialized;
@property (nonatomic, assign) BOOL micCaptureIsPaused;
@end

@implementation ScreenRecorderImpl

- (BOOL)startRecording:(uint32_t)displayID windowID:(uint32_t)windowID outputPath:(NSString *)outputPath error:(NSString **)error {
    @try {
        self.outputURL = [NSURL fileURLWithPath:outputPath];
        self.sessionStarted = NO;
        self.micTimeInitialized = NO;

        NSLog(@"[ScreenRecorder] Starting AUDIO-ONLY recording to %@", outputPath);

        // Setup asset writer for audio-only recording (no video)
        if (![self setupAssetWriterAudioOnly:error]) {
            return NO;
        }

        // Start microphone capture (direct microphone input)
        if (![self startMicrophoneCapture:error]) {
            return NO;
        }

        // Start system audio capture
        if (![self startSystemAudioCapture:error]) {
            return NO;
        }

        self.isRecording = YES;
        NSLog(@"[ScreenRecorder] Audio-only recording started successfully");

        return YES;

    } @catch (NSException *exception) {
        NSLog(@"[ScreenRecorder] Exception: %@", exception);
        if (error) {
            *error = [NSString stringWithFormat:@"Exception: %@", exception.reason];
        }
        return NO;
    }
}

- (BOOL)setupAssetWriterAudioOnly:(NSString **)error {
    // Remove existing file
    [[NSFileManager defaultManager] removeItemAtURL:self.outputURL error:nil];

    NSError *writerError = nil;
    self.assetWriter = [[AVAssetWriter alloc] initWithURL:self.outputURL fileType:AVFileTypeQuickTimeMovie error:&writerError];
    if (writerError) {
        NSLog(@"[ScreenRecorder] Failed to create asset writer: %@", writerError);
        if (error) {
            *error = [NSString stringWithFormat:@"Failed to create asset writer: %@", writerError.localizedDescription];
        }
        return NO;
    }

    // Audio settings for high-quality audio capture
    NSDictionary *audioSettings = @{
        AVFormatIDKey: @(kAudioFormatMPEG4AAC),
        AVSampleRateKey: @(48000),
        AVNumberOfChannelsKey: @(2),
        AVEncoderBitRateKey: @(128000)
    };

    // System audio input
    self.audioInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeAudio outputSettings:audioSettings];
    self.audioInput.expectsMediaDataInRealTime = YES;

    if ([self.assetWriter canAddInput:self.audioInput]) {
        [self.assetWriter addInput:self.audioInput];
        NSLog(@"[ScreenRecorder] Added system audio track");
    } else {
        NSLog(@"[ScreenRecorder] Cannot add system audio input");
        if (error) {
            *error = @"Cannot add system audio input";
        }
        return NO;
    }

    // Microphone audio input (separate track)
    self.micAudioInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeAudio outputSettings:audioSettings];
    self.micAudioInput.expectsMediaDataInRealTime = YES;

    if ([self.assetWriter canAddInput:self.micAudioInput]) {
        [self.assetWriter addInput:self.micAudioInput];
        NSLog(@"[ScreenRecorder] Added microphone audio track");
    } else {
        NSLog(@"[ScreenRecorder] Cannot add microphone audio input");
        self.micAudioInput = nil;
    }

    [self.assetWriter startWriting];
    NSLog(@"[ScreenRecorder] Audio-only asset writer started");
    return YES;
}

// NOTE: setupAssetWriterWithWidth:height:error: method removed
// Now using audio-only recording with setupAssetWriterAudioOnly:
// See startRecording method for audio-only implementation

- (NSString *)stopRecordingWithError:(NSString **)error {
    if (!self.isRecording) {
        // Check if stream was interrupted and file was already saved
        if (self.sessionStarted && [[NSFileManager defaultManager] fileExistsAtPath:self.outputURL.path]) {
            NSLog(@"[ScreenRecorder] Recording already stopped (likely interrupted), returning saved file");
            return self.outputURL.path;
        }

        if (error) {
            *error = @"Not recording";
        }
        return nil;
    }

    self.isRecording = NO;
    NSLog(@"[ScreenRecorder] Stopping audio-only recording...");

    // Stop microphone capture
    [self stopMicrophoneCapture];

    // Stop system audio capture
    [self stopSystemAudioCapture];

    // Check if asset writer is already finished (from stream interruption)
    if (self.assetWriter.status == AVAssetWriterStatusCompleted ||
        self.assetWriter.status == AVAssetWriterStatusCancelled) {
        NSLog(@"[ScreenRecorder] Asset writer already finished (status: %ld)", (long)self.assetWriter.status);

        if ([[NSFileManager defaultManager] fileExistsAtPath:self.outputURL.path]) {
            return self.outputURL.path;
        } else {
            if (error) {
                *error = @"Recording file not found after interruption";
            }
            return nil;
        }
    }

    // Finish writing
    if (self.sessionStarted) {
        // Mark audio inputs as finished (no video input for audio-only)
        [self.audioInput markAsFinished];
        if (self.micAudioInput) {
            [self.micAudioInput markAsFinished];
        }

        dispatch_semaphore_t finishSemaphore = dispatch_semaphore_create(0);
        [self.assetWriter finishWritingWithCompletionHandler:^{
            dispatch_semaphore_signal(finishSemaphore);
        }];
        dispatch_semaphore_wait(finishSemaphore, DISPATCH_TIME_FOREVER);

        if (self.assetWriter.error) {
            NSLog(@"[ScreenRecorder] Asset writer error: %@", self.assetWriter.error);
            if (error) {
                *error = [NSString stringWithFormat:@"Asset writer error: %@", self.assetWriter.error.localizedDescription];
            }
            return nil;
        }

        NSLog(@"[ScreenRecorder] Audio-only recording completed successfully");
        return self.outputURL.path;
    } else {
        NSLog(@"[ScreenRecorder] Warning: Recording stopped before any audio was captured");
        [self.assetWriter cancelWriting];
        [[NSFileManager defaultManager] removeItemAtURL:self.outputURL error:nil];
        if (error) {
            *error = @"No audio was captured";
        }
        return nil;
    }
}

- (BOOL)startMicrophoneCapture:(NSString **)outError {
    NSLog(@"[ScreenRecorder] Starting microphone capture...");

    // Check authorization status first
    AVAuthorizationStatus authStatus = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    NSLog(@"[ScreenRecorder] Microphone authorization status: %ld (0=NotDetermined, 1=Restricted, 2=Denied, 3=Authorized)", (long)authStatus);

    // Request permission if not determined
    if (authStatus == AVAuthorizationStatusNotDetermined) {
        NSLog(@"[ScreenRecorder] Requesting microphone permission...");
        dispatch_semaphore_t permissionSemaphore = dispatch_semaphore_create(0);

        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
            NSLog(@"[ScreenRecorder] Microphone permission %@", granted ? @"GRANTED" : @"DENIED");
            dispatch_semaphore_signal(permissionSemaphore);
        }];

        dispatch_semaphore_wait(permissionSemaphore, DISPATCH_TIME_FOREVER);

        // Refresh auth status
        authStatus = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
        NSLog(@"[ScreenRecorder] New authorization status: %ld", (long)authStatus);
    }

    // Check permission denial early
    if (authStatus == AVAuthorizationStatusDenied || authStatus == AVAuthorizationStatusRestricted) {
        NSLog(@"[ScreenRecorder] ERROR: Microphone access denied or restricted!");
        if (outError) {
            *outError = @"Microphone access denied. Please grant permission in System Settings > Privacy & Security > Microphone.";
        }
        return NO;
    }

    // Get built-in microphone (not virtual audio devices like "Display Audio")
    AVCaptureDevice *micDevice = nil;

    // Use AVCaptureDeviceDiscoverySession instead of deprecated devicesWithMediaType:
    AVCaptureDeviceDiscoverySession *discoverySession = [AVCaptureDeviceDiscoverySession
        discoverySessionWithDeviceTypes:@[AVCaptureDeviceTypeBuiltInMicrophone, AVCaptureDeviceTypeExternalUnknown]
        mediaType:AVMediaTypeAudio
        position:AVCaptureDevicePositionUnspecified];
    NSArray *audioDevices = discoverySession.devices;

    // Log all available audio devices for debugging
    NSLog(@"[ScreenRecorder] Available audio devices (%lu):", (unsigned long)audioDevices.count);
    for (AVCaptureDevice *device in audioDevices) {
        NSLog(@"[ScreenRecorder]   - %@ (type: %@)", device.localizedName, device.deviceType);
    }

    // First, try to find built-in microphone
    for (AVCaptureDevice *device in audioDevices) {
        NSString *name = [device.localizedName lowercaseString];
        if ([name containsString:@"built-in"] || [name containsString:@"macbook"]) {
            micDevice = device;
            NSLog(@"[ScreenRecorder] Selected built-in microphone: %@", device.localizedName);
            break;
        }
    }

    // If no built-in mic found, use any available device (but skip "Display Audio")
    if (!micDevice) {
        for (AVCaptureDevice *device in audioDevices) {
            NSString *name = [device.localizedName lowercaseString];
            if (![name containsString:@"display audio"]) {
                micDevice = device;
                NSLog(@"[ScreenRecorder] Selected microphone: %@ (type: %@)", device.localizedName, device.deviceType);
                break;
            }
        }
    }

    if (!micDevice) {
        NSLog(@"[ScreenRecorder] ERROR: No suitable microphone device found");
        if (outError) {
            *outError = @"No microphone found. Please connect a microphone or check your audio settings.";
        }
        return NO;
    }

    NSError *error = nil;
    AVCaptureDeviceInput *micInput = [AVCaptureDeviceInput deviceInputWithDevice:micDevice error:&error];
    if (error || !micInput) {
        NSLog(@"[ScreenRecorder] ERROR: Failed to create microphone input: %@", error);
        if (outError) {
            *outError = [NSString stringWithFormat:@"Failed to access microphone '%@': %@",
                        micDevice.localizedName,
                        error.localizedDescription ?: @"Unknown error"];
        }
        return NO;
    }
    NSLog(@"[ScreenRecorder] Created microphone input");

    // Create capture session
    self.micSession = [[AVCaptureSession alloc] init];
    [self.micSession beginConfiguration];

    if ([self.micSession canAddInput:micInput]) {
        [self.micSession addInput:micInput];
        NSLog(@"[ScreenRecorder] Added microphone input to session");
    } else {
        NSLog(@"[ScreenRecorder] ERROR: Cannot add microphone input to session");
        if (outError) {
            *outError = [NSString stringWithFormat:@"Cannot configure microphone '%@'. It may be in use by another application.", micDevice.localizedName];
        }
        return NO;
    }

    // Create audio data output
    self.micOutput = [[AVCaptureAudioDataOutput alloc] init];
    self.micQueue = dispatch_queue_create("com.om.micQueue", DISPATCH_QUEUE_SERIAL);
    [self.micOutput setSampleBufferDelegate:(id<AVCaptureAudioDataOutputSampleBufferDelegate>)self queue:self.micQueue];

    if ([self.micSession canAddOutput:self.micOutput]) {
        [self.micSession addOutput:self.micOutput];
        NSLog(@"[ScreenRecorder] Added microphone output to session");
    } else {
        NSLog(@"[ScreenRecorder] ERROR: Cannot add microphone output to session");
        if (outError) {
            *outError = @"Failed to configure audio output. Please try again.";
        }
        return NO;
    }

    [self.micSession commitConfiguration];

    // Check if session is actually running
    if ([self.micSession canSetSessionPreset:AVCaptureSessionPresetHigh]) {
        [self.micSession setSessionPreset:AVCaptureSessionPresetHigh];
    }

    [self.micSession startRunning];

    BOOL isRunning = [self.micSession isRunning];
    NSLog(@"[ScreenRecorder] Microphone capture session running: %@", isRunning ? @"YES" : @"NO");

    if (!isRunning) {
        NSLog(@"[ScreenRecorder] ERROR: Microphone capture session failed to start!");
        if (outError) {
            *outError = [NSString stringWithFormat:@"Microphone '%@' failed to start. Please check your audio settings.", micDevice.localizedName];
        }
        return NO;
    }

    NSLog(@"[ScreenRecorder] Microphone capture started successfully with device: %@", micDevice.localizedName);
    return YES;
}

- (void)stopMicrophoneCapture {
    if (self.micSession) {
        [self.micSession stopRunning];
        self.micSession = nil;
        self.micOutput = nil;
        self.micQueue = nil;
        self.micCaptureIsPaused = NO;
        NSLog(@"[ScreenRecorder] Microphone capture stopped");
    }
}

- (BOOL)pauseMicCaptureWithError:(NSString **)error {
    if (!self.isRecording || !self.micSession) {
        if (error) *error = @"Not recording or no mic session";
        return NO;
    }
    if (self.micCaptureIsPaused) {
        return YES; // Already paused
    }

    [self.micSession stopRunning];
    self.micCaptureIsPaused = YES;
    return YES;
}

- (BOOL)resumeMicCaptureWithError:(NSString **)error {
    if (!self.isRecording || !self.micSession) {
        if (error) *error = @"Not recording or no mic session";
        return NO;
    }
    if (!self.micCaptureIsPaused) {
        return YES; // Not paused
    }

    [self.micSession startRunning];
    self.micCaptureIsPaused = NO;
    return YES;
}

- (BOOL)isMicCapturePaused {
    return self.micCaptureIsPaused;
}

- (BOOL)startSystemAudioCapture:(NSString **)error {
    NSLog(@"[ScreenRecorder] Starting system audio capture...");

    // Use ScreenCaptureKit to capture system audio
    // Get shareable content synchronously using semaphore
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block SCShareableContent *content = nil;
    __block NSError *contentError = nil;

    [SCShareableContent getShareableContentExcludingDesktopWindows:NO
                                                onScreenWindowsOnly:YES
                                                  completionHandler:^(SCShareableContent *shareableContent, NSError *err) {
        content = shareableContent;
        contentError = err;
        dispatch_semaphore_signal(semaphore);
    }];

    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

    if (contentError) {
        NSLog(@"[ScreenRecorder] Failed to get shareable content: %@", contentError);
        if (error) {
            *error = [NSString stringWithFormat:@"Failed to get shareable content: %@", contentError.localizedDescription];
        }
        return NO;
    }

    // Use first available display for audio capture
    SCDisplay *display = nil;
    if (content.displays.count > 0) {
        display = content.displays[0];
        NSLog(@"[ScreenRecorder] Using display for system audio: ID=%u", display.displayID);
    } else {
        if (error) {
            *error = @"No display found for system audio capture";
        }
        return NO;
    }

    // Create display filter
    SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:display excludingWindows:@[]];

    // Configure stream for audio capture with minimal video overhead
    // ScreenCaptureKit requires screen output to be added (audio-only not supported)
    // Workaround: Set very low frame rate (0.1 FPS) to minimize CPU/memory usage
    SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
    config.width = display.width;
    config.height = display.height;
    config.minimumFrameInterval = CMTimeMake(10, 1); // 0.1 FPS (1 frame every 10 seconds)
    config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange;
    config.capturesAudio = YES;
    config.sampleRate = 48000;
    config.channelCount = 2;
    config.excludesCurrentProcessAudio = YES;

    // Create stream
    self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];

    // Add screen output (required by ScreenCaptureKit, even for audio-only)
    // Frames will be ignored by handleVideoSample() since videoInput is nil
    NSError *outputError = nil;
    [self.stream addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0) error:&outputError];
    if (outputError) {
        NSLog(@"[ScreenRecorder] Failed to add screen output: %@", outputError);
        if (error) {
            *error = [NSString stringWithFormat:@"Failed to add screen output: %@", outputError.localizedDescription];
        }
        return NO;
    }

    // Add audio output (the actual data we want)
    outputError = nil;
    [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0) error:&outputError];
    if (outputError) {
        NSLog(@"[ScreenRecorder] Failed to add audio output: %@", outputError);
        if (error) {
            *error = [NSString stringWithFormat:@"Failed to add audio output: %@", outputError.localizedDescription];
        }
        return NO;
    }

    // Start capture
    dispatch_semaphore_t startSemaphore = dispatch_semaphore_create(0);
    __block NSError *startError = nil;

    [self.stream startCaptureWithCompletionHandler:^(NSError *err) {
        startError = err;
        dispatch_semaphore_signal(startSemaphore);
    }];

    dispatch_semaphore_wait(startSemaphore, DISPATCH_TIME_FOREVER);

    if (startError) {
        NSLog(@"[ScreenRecorder] Failed to start system audio capture: %@", startError);
        if (error) {
            *error = [NSString stringWithFormat:@"Failed to start system audio capture: %@", startError.localizedDescription];
        }
        return NO;
    }

    NSLog(@"[ScreenRecorder] System audio capture started successfully");
    return YES;
}

- (void)stopSystemAudioCapture {
    if (self.stream) {
        dispatch_semaphore_t stopSemaphore = dispatch_semaphore_create(0);
        __block NSError *stopError = nil;

        [self.stream stopCaptureWithCompletionHandler:^(NSError *err) {
            stopError = err;
            dispatch_semaphore_signal(stopSemaphore);
        }];

        dispatch_semaphore_wait(stopSemaphore, DISPATCH_TIME_FOREVER);

        if (stopError) {
            NSLog(@"[ScreenRecorder] Error stopping system audio stream: %@", stopError);
        }

        self.stream = nil;
        NSLog(@"[ScreenRecorder] System audio capture stopped");
    }
}

// MARK: - AVCaptureAudioDataOutputSampleBufferDelegate

- (void)captureOutput:(AVCaptureOutput *)output didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer fromConnection:(AVCaptureConnection *)connection {
    // This handles microphone samples from AVCaptureSession

    // Debug: Log every 100th sample to see if delegate is being called
    static int sampleCount = 0;
    sampleCount++;
    // Removed noisy microphone delegate logs

    if (!self.isRecording) return;
    if (!self.micAudioInput) return;

    // Start session on first audio sample (audio-only recording) - thread-safe
    @synchronized(self) {
        if (!self.sessionStarted) {
            CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
            [self.assetWriter startSessionAtSourceTime:presentationTime];
            self.firstMicTime = presentationTime;
            self.sessionStarted = YES;
            self.micTimeInitialized = YES;
            NSLog(@"[ScreenRecorder] Started audio-only session at time: %f (from mic)", CMTimeGetSeconds(presentationTime));
        }
    }

    // For audio-only recording, use timestamps directly (no video timeline to align with)
    if (self.micAudioInput && self.micAudioInput.isReadyForMoreMediaData) {
        [self.micAudioInput appendSampleBuffer:sampleBuffer];
    } else if (sampleCount % 100 == 1) {
        NSLog(@"[ScreenRecorder] WARNING: Mic audio input not ready (exists=%@, ready=%@)",
              self.micAudioInput ? @"YES" : @"NO",
              self.micAudioInput && self.micAudioInput.isReadyForMoreMediaData ? @"YES" : @"NO");
    }
}

// MARK: - SCStreamOutput

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (!self.isRecording) return;

    switch (type) {
        case SCStreamOutputTypeScreen:
            [self handleVideoSample:sampleBuffer];
            break;
        case SCStreamOutputTypeAudio:
        case SCStreamOutputTypeMicrophone:
            [self handleAudioSample:sampleBuffer];
            break;
        default:
            break;
    }
}

- (void)handleVideoSample:(CMSampleBufferRef)sampleBuffer {
    // Skip video handling in audio-only mode (no videoInput)
    if (!self.videoInput) {
        // Log if we unexpectedly receive video frames in audio-only mode
        // This is expected due to ScreenCaptureKit workaround (0.1 FPS) but log for diagnostics
        static dispatch_once_t onceToken;
        dispatch_once(&onceToken, ^{
            NSLog(@"[ScreenRecorder] Receiving video frames in audio-only mode (expected due to ScreenCaptureKit workaround at 0.1 FPS)");
        });
        return;
    }

    // Validate sample buffer
    if (!sampleBuffer || !CMSampleBufferIsValid(sampleBuffer)) {
        return;
    }

    // Check if this is a video sample (has image buffer)
    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!imageBuffer) {
        // This might be an audio sample incorrectly routed here, silently skip
        return;
    }

    // Start session on first valid video frame - thread-safe
    @synchronized(self) {
        if (!self.sessionStarted) {
            CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
            [self.assetWriter startSessionAtSourceTime:presentationTime];
            self.firstVideoTime = presentationTime;
            self.sessionStarted = YES;
            NSLog(@"[ScreenRecorder] Started session at time: %f (from video)", CMTimeGetSeconds(presentationTime));
        }
    }

    CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);

    // Append using pixel buffer adaptor
    if (self.videoInput.isReadyForMoreMediaData) {
        [self.pixelBufferAdaptor appendPixelBuffer:imageBuffer withPresentationTime:presentationTime];
    }
}

- (void)handleAudioSample:(CMSampleBufferRef)sampleBuffer {
    if (!self.isRecording) return;

    // Start session on first system audio sample if not already started - thread-safe
    @synchronized(self) {
        if (!self.sessionStarted) {
            CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
            [self.assetWriter startSessionAtSourceTime:presentationTime];
            self.sessionStarted = YES;
            NSLog(@"[ScreenRecorder] Started audio session at time: %f (from system audio)", CMTimeGetSeconds(presentationTime));
        }
    }

    if (self.audioInput.isReadyForMoreMediaData) {
        [self.audioInput appendSampleBuffer:sampleBuffer];
    }
}

// MARK: - SCStreamDelegate

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    NSLog(@"[ScreenRecorder] Stream stopped with error: %@", error);

    // Stream was interrupted (system audio stopped, system interrupt, etc.)
    // Save recording gracefully to preserve what was captured
    if (self.isRecording) {
        NSLog(@"[ScreenRecorder] Stream interrupted, saving recording gracefully...");

        // Stop microphone capture
        [self stopMicrophoneCapture];

        // Finish writing if we captured any audio
        if (self.sessionStarted) {
            // Mark audio inputs as finished (no video for audio-only)
            [self.audioInput markAsFinished];
            if (self.micAudioInput) {
                [self.micAudioInput markAsFinished];
            }

            dispatch_semaphore_t finishSemaphore = dispatch_semaphore_create(0);
            [self.assetWriter finishWritingWithCompletionHandler:^{
                dispatch_semaphore_signal(finishSemaphore);
            }];
            dispatch_semaphore_wait(finishSemaphore, DISPATCH_TIME_FOREVER);

            if (self.assetWriter.error) {
                NSLog(@"[ScreenRecorder] Error saving interrupted recording: %@", self.assetWriter.error);
            } else {
                NSLog(@"[ScreenRecorder] Interrupted recording saved successfully: %@", self.outputURL.path);
            }
        } else {
            NSLog(@"[ScreenRecorder] No audio captured before interruption, removing file");
            [self.assetWriter cancelWriting];
            [[NSFileManager defaultManager] removeItemAtURL:self.outputURL error:nil];
        }
    }

    self.isRecording = NO;
}

@end

// C++ wrapper for Node.js addon
namespace screen_recorder {

static ScreenRecorderImpl *globalRecorder = nil;

bool StartRecording(uint32_t displayID, uint32_t windowID, const std::string& outputPath, std::string& error) {
    @autoreleasepool {
        if (!globalRecorder) {
            globalRecorder = [[ScreenRecorderImpl alloc] init];
        }

        NSString *path = [NSString stringWithUTF8String:outputPath.c_str()];
        NSString *errorStr = nil;

        BOOL success = [globalRecorder startRecording:displayID windowID:windowID outputPath:path error:&errorStr];

        if (!success && errorStr) {
            error = std::string([errorStr UTF8String]);
        }

        return success;
    }
}

std::string StopRecording(std::string& error) {
    @autoreleasepool {
        if (!globalRecorder) {
            error = "No active recording";
            return "";
        }

        NSString *errorStr = nil;
        NSString *outputPath = [globalRecorder stopRecordingWithError:&errorStr];

        if (!outputPath && errorStr) {
            error = std::string([errorStr UTF8String]);
            return "";
        }

        return outputPath ? std::string([outputPath UTF8String]) : "";
    }
}

bool IsRecording() {
    @autoreleasepool {
        if (!globalRecorder) {
            return false;
        }
        return globalRecorder.isRecording;
    }
}

bool PauseMicCapture(std::string& error) {
    @autoreleasepool {
        if (!globalRecorder) {
            error = "No active recording";
            return false;
        }

        NSString *errorStr = nil;
        BOOL success = [globalRecorder pauseMicCaptureWithError:&errorStr];

        if (!success && errorStr) {
            error = std::string([errorStr UTF8String]);
        }

        return success;
    }
}

bool ResumeMicCapture(std::string& error) {
    @autoreleasepool {
        if (!globalRecorder) {
            error = "No active recording";
            return false;
        }

        NSString *errorStr = nil;
        BOOL success = [globalRecorder resumeMicCaptureWithError:&errorStr];

        if (!success && errorStr) {
            error = std::string([errorStr UTF8String]);
        }

        return success;
    }
}

bool IsMicCapturePaused() {
    @autoreleasepool {
        if (!globalRecorder) {
            return false;
        }
        return globalRecorder.isMicCapturePaused;
    }
}

} // namespace screen_recorder
