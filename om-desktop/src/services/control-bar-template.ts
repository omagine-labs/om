/**
 * HTML template for the recording control bar
 *
 * This generates the inline HTML for the control bar UI.
 * We use a data: URL approach instead of loading from a file because:
 * - Simpler deployment: No separate HTML file to bundle
 * - Single source of truth: HTML, CSS, and JS in one place
 * - No preload script needed: We inject APIs via executeJavaScript
 */

export function generateControlBarHTML(
  meetingTitle: string,
  state: string
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline';">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: transparent;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
          }

          .control-bar {
            -webkit-app-region: drag;
            background-color: #00786F;
            border-radius: 0px;
            padding: 8px 12px 8px 20px;
            box-shadow: none;
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            width: 100%;
            height: 100%;
          }

          .info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
          }

          .status-indicator {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            animation: pulse 2s ease-in-out infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }

          .mic-icon {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            display: none;
          }

          #micOnIcon {
            animation: pulse 2s ease-in-out infinite;
          }

          .title-container {
            flex: 1;
            min-width: 0;
          }

          .title {
            font-size: 15px;
            font-weight: 400;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .controls {
            display: flex;
            gap: 8px;
            -webkit-app-region: no-drag;
          }

          button {
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            font-size: 14px;
            line-height: 20px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.05s;
            backdrop-filter: none;
            -webkit-app-region: no-drag;
            letter-spacing: 0.02em;
          }

          button:hover {
            background: rgba(255, 255, 255, 0.3);
          }

          button:active {
            background: rgba(0, 0, 0, 0.1);
          }

          button.primary {
            background: rgba(187, 244, 81, 0.90);
            color: #1D293D;
          }

          button.primary:hover {
            background: rgba(187, 244, 81, 1.0);
          }

          button.secondary {
            background: rgba(53, 131, 123, 0.90);
            color: #ffffff;
          }

          button.secondary:hover {
            background: rgba(0, 0, 0, 0.15);
          }

          button.transparent {
            background: rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.85);
          }

          button.orange {
            background: rgba(255, 174, 88, 1.0);
            color: #1D293D;
          }

          button.orange:hover {
            background: rgba(255, 195, 99, 1.0);
          }

          button.transparent:hover {
            background: rgba(255, 255, 255, 0.25);
          }

          button.success {
            background: rgba(187, 244, 81, 0.90);
            color: #1D293D;
          }

          button.success:hover {
            background: rgba(187, 244, 81, 1);
          }

          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          button:disabled:hover {
            background: rgba(255, 255, 255, 0.2);
          }

          button.primary:disabled:hover {
            background: rgba(187, 244, 81, 0.90);
          }

          .button-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(29, 41, 61, 0.3);
            border-top-color: #1D293D;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
          }

          /* Multiple meetings state - amber/yellow gradient */
          .control-bar.multiple-meetings {
            background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
          }

          /* Processing state - blue with spinner */
          .control-bar.processing {
            background: linear-gradient(135deg, #544fe3 0%, #3bbcf6 100%);
          }

          .control-bar.processing .status-indicator {
            animation: none;
            opacity: 1;
          }

          .control-bar.processing .title {
            display: none;
          }

          .status-text {
            font-size: 15px;
            font-weight: 400;
            display: none;
          }

          .control-bar.processing .status-text {
            display: block;
          }

          .spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: none;
            flex-shrink: 0;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .control-bar.processing .spinner {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="control-bar" id="controlBar">
          <div class="info">
            <!-- Audio Wave Icon (shown when detected/idle - prompting state) -->
            <svg id="statusIndicator" class="status-indicator" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none">
              <path opacity="0.4" fill-rule="evenodd" clip-rule="evenodd" d="M10.5 4C10.2239 4 10 4.22386 10 4.5V16.5C10 17.8807 8.88071 19 7.5 19C6.11929 19 5 17.8807 5 16.5V9.5C5 9.22386 4.77614 9 4.5 9C4.22386 9 4 9.22386 4 9.5V14C4 14.5523 3.55228 15 3 15C2.44772 15 2 14.5523 2 14V9.5C2 8.11929 3.11929 7 4.5 7C5.88071 7 7 8.11929 7 9.5V16.5C7 16.7761 7.22386 17 7.5 17C7.77614 17 8 16.7761 8 16.5V4.5C8 3.11929 9.11929 2 10.5 2C11.8807 2 13 3.11929 13 4.5V19.5C13 19.7761 13.2239 20 13.5 20C13.7761 20 14 19.7761 14 19.5V8.5C14 7.11929 15.1193 6 16.5 6C17.8807 6 19 7.11929 19 8.5V15.5C19 15.7761 19.2239 16 19.5 16C19.7761 16 20 15.7761 20 15.5V12C20 11.4477 20.4477 11 21 11C21.5523 11 22 11.4477 22 12V15.5C22 16.8807 20.8807 18 19.5 18C18.1193 18 17 16.8807 17 15.5V8.5C17 8.22386 16.7761 8 16.5 8C16.2239 8 16 8.22386 16 8.5V19.5C16 20.8807 14.8807 22 13.5 22C12.1193 22 11 20.8807 11 19.5V4.5C11 4.22386 10.7761 4 10.5 4Z" fill="#ffffff"></path>
              <path d="M10.5 4C10.2239 4 10 4.22386 10 4.5V16.5C10 17.8807 8.88071 19 7.5 19C6.11929 19 5 17.8807 5 16.5V9.5C5 9.22386 4.77614 9 4.5 9C4.22386 9 4 9.22386 4 9.5V14C4 14.5523 3.55228 15 3 15C2.44772 15 2 14.5523 2 14V9.5C2 8.11929 3.11929 7 4.5 7C5.88071 7 7 8.11929 7 9.5V16.5C7 16.7761 7.22386 17 7.5 17C7.77614 17 8 16.7761 8 16.5V4.5C8 3.11929 9.11929 2 10.5 2C11.8807 2 13 3.11929 13 4.5V12H11V4.5C11 4.22386 10.7761 4 10.5 4Z" fill="#ffffff"></path>
            </svg>
            <div class="spinner" id="spinner"></div>
            <!-- Mic On Icon (shown when actively recording) -->
            <svg id="micOnIcon" class="mic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none">
              <path opacity="0.4" d="M6.25 7C6.25 3.82436 8.82436 1.25 12 1.25C15.1756 1.25 17.75 3.82436 17.75 7V11C17.75 14.1756 15.1756 16.75 12 16.75C8.82436 16.75 6.25 14.1756 6.25 11V7Z" fill="#BBF451" />
              <path d="M17.75 10.25V11C17.75 11.2542 17.7335 11.5045 17.7015 11.75H14C13.5858 11.75 13.25 11.4142 13.25 11C13.25 10.5858 13.5858 10.25 14 10.25H17.75Z" fill="#BBF451" />
              <path d="M17.7015 6.25C17.7335 6.49547 17.75 6.74581 17.75 7V7.75H14C13.5858 7.75 13.25 7.41421 13.25 7C13.25 6.58579 13.5858 6.25 14 6.25H17.7015Z" fill="#BBF451" />
              <path fill-rule="evenodd" clip-rule="evenodd" d="M4.22222 10.25C4.75917 10.25 5.19444 10.6805 5.19444 11.2115C5.19444 14.9288 8.2414 17.9423 12 17.9423C15.7586 17.9423 18.8056 14.9288 18.8056 11.2115C18.8056 10.6805 19.2408 10.25 19.7778 10.25C20.3147 10.25 20.75 10.6805 20.75 11.2115C20.75 15.6659 17.3472 19.3343 12.9722 19.8126V20.8269H14.9167C15.4536 20.8269 15.8889 21.2574 15.8889 21.7885C15.8889 22.3195 15.4536 22.75 14.9167 22.75H9.08333C8.54639 22.75 8.11111 22.3195 8.11111 21.7885C8.11111 21.2574 8.54639 20.8269 9.08333 20.8269H11.0278V19.8126C6.65283 19.3343 3.25 15.6659 3.25 11.2115C3.25 10.6805 3.68528 10.25 4.22222 10.25Z" fill="#BBF451" />
            </svg>
            <!-- Mic Off Icon (shown when off-record) -->
            <svg id="micOffIcon" class="mic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none">
              <g opacity="0.4">
                <path d="M4.22222 10.2501C4.75917 10.2501 5.19444 10.6806 5.19444 11.2117C5.19444 14.929 8.2414 17.9424 12 17.9424C13.664 17.9424 15.1885 17.3518 16.3709 16.3709L17.7418 17.7418C16.435 18.8667 14.7873 19.6143 12.9722 19.8127V20.827H14.9167C15.4536 20.827 15.8889 21.2575 15.8889 21.7886C15.8889 22.3196 15.4536 22.7501 14.9167 22.7501H9.08333C8.54639 22.7501 8.11111 22.3196 8.11111 21.7886C8.11111 21.2575 8.54639 20.827 9.08333 20.827H11.0278V19.8127C6.65283 19.3344 3.25 15.666 3.25 11.2117C3.25 10.6806 3.68528 10.2501 4.22222 10.2501Z" fill="#FFA647"></path>
                <path d="M18.8056 11.2117C18.8056 10.6806 19.2408 10.2501 19.7778 10.2501C20.3147 10.2501 20.75 10.6806 20.75 11.2117C20.75 12.6538 20.3933 14.0136 19.7624 15.2094C19.6076 15.5029 19.5301 15.6497 19.3803 15.6723C19.2305 15.695 19.1073 15.5718 18.8611 15.3255L18.2934 14.7579C18.1427 14.6071 18.0673 14.5317 18.0509 14.4384C18.0345 14.3452 18.0827 14.2421 18.1792 14.036C18.5812 13.1772 18.8056 12.2203 18.8056 11.2117Z" fill="#FFA647"></path>
              </g>
              <path d="M4.22222 10.25C4.75917 10.25 5.19444 10.6805 5.19444 11.2115C5.19444 14.9288 8.2414 17.9423 12 17.9423C13.664 17.9423 15.1885 17.3517 16.3709 16.3708L17.7418 17.7417C16.435 18.8666 14.7873 19.6141 12.9722 19.8126V20.8269H14.9167C15.4536 20.8269 15.8889 21.2574 15.8889 21.7885C15.8889 22.3195 15.4536 22.75 14.9167 22.75H9.08333C8.54639 22.75 8.11111 22.3195 8.11111 21.7885C8.11111 21.2574 8.54639 20.8269 9.08333 20.8269H11.0278V19.8126C6.65283 19.3343 3.25 15.6659 3.25 11.2115C3.25 10.6805 3.68528 10.25 4.22222 10.25Z" fill="#FFA647"></path>
              <g opacity="0.4">
                <path d="M6.25 7.00012V11.0001C6.25 14.1758 8.82436 16.7501 12 16.7501C13.0898 16.7501 14.1087 16.447 14.9772 15.9204C15.2338 15.7647 15.3621 15.6869 15.3796 15.542C15.3971 15.3971 15.2833 15.2833 15.0555 15.0555L6.79426 6.79426C6.76014 6.76014 6.74307 6.74307 6.72091 6.72771C6.55245 6.61093 6.29136 6.71908 6.25481 6.92077C6.25 6.9473 6.25 6.96491 6.25 7.00012Z" fill="#FFA647"></path>
                <path d="M17.75 9.65012V8.35012C17.75 8.06728 17.75 7.92586 17.6621 7.83799C17.5743 7.75012 17.4328 7.75012 17.15 7.75012H14C13.5858 7.75012 13.25 7.41434 13.25 7.00012C13.25 6.58591 13.5858 6.25012 14 6.25012H17.0183C17.3425 6.25012 17.5046 6.25012 17.5947 6.13428C17.6847 6.01844 17.6475 5.87204 17.5731 5.57923C16.9406 3.09079 14.6852 1.25012 12 1.25012C10.2178 1.25012 8.62506 2.06089 7.57037 3.3337C7.42537 3.50869 7.35287 3.59618 7.3583 3.71218C7.36372 3.82819 7.44982 3.91429 7.62202 4.08649L13.6099 10.0744C13.6966 10.1611 13.74 10.2044 13.7951 10.2273C13.8502 10.2501 13.9116 10.2501 14.0342 10.2501H17.15C17.4328 10.2501 17.5743 10.2501 17.6621 10.1623C17.75 10.0744 17.75 9.93296 17.75 9.65012Z" fill="#FFA647"></path>
                <path d="M17.5947 11.866C17.6847 11.9818 17.6475 12.1282 17.5731 12.421C17.5376 12.5607 17.497 12.6983 17.4515 12.8337C17.3373 13.1733 17.2802 13.3432 17.1176 13.3813C16.955 13.4195 16.8189 13.2834 16.5467 13.0111L15.6271 12.0915C15.4818 11.9462 15.4091 11.8736 15.4347 11.8119C15.4603 11.7501 15.563 11.7501 15.7685 11.7501H17.0183C17.3425 11.7501 17.5046 11.7501 17.5947 11.866Z" fill="#FFA647"></path>
              </g>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M1.29289 1.29289C1.68342 0.902369 2.31658 0.902369 2.70711 1.29289L22.7071 21.2929C23.0976 21.6834 23.0976 22.3166 22.7071 22.7071C22.3166 23.0976 21.6834 23.0976 21.2929 22.7071L1.29289 2.70711C0.902369 2.31658 0.902369 1.68342 1.29289 1.29289Z" fill="#FFA647"></path>
              <path d="M6.25 7V11C6.25 14.1756 8.82436 16.75 12 16.75C13.0898 16.75 14.1087 16.4468 14.9772 15.9202C15.2338 15.7646 15.3621 15.6868 15.3796 15.5419C15.3971 15.397 15.2833 15.2831 15.0555 15.0554L6.79426 6.79413C6.76014 6.76001 6.74307 6.74294 6.72091 6.72758C6.55245 6.61081 6.29136 6.71895 6.25481 6.92065C6.25 6.94718 6.25 6.96478 6.25 7Z" fill="#FFA647"></path>
            </svg>
            <div class="title-container">
              <div class="title" id="title">${meetingTitle}</div>
              <div class="status-text" id="statusText"></div>
            </div>
          </div>
          <div class="controls">
            <button id="startBtn" class="primary" style="display: none;">Start Recording</button>
            <button id="dismissBtn" class="secondary" style="display: none;">Dismiss</button>
            <button id="toggleBtn" class="orange" style="display: none;">Go off record</button>
            <button id="endBtn" class="secondary" style="display: none;">Stop</button>
            <button id="stopBtn" class="secondary" style="display: none;">Stop Recording</button>
          </div>        </div>

        <script>
          // Save original console methods before overriding
          const originalLog = console.log;
          const originalError = console.error;
          const originalInfo = console.info;

          // Listen for custom events and forward as console messages for IPC
          window.addEventListener('control-bar-action', (event) => {
            originalInfo.call(console, 'CONTROL_BAR_ACTION:' + event.detail);
          });

          // Override console methods to add cleaner source labels
          console.log = (...args) => originalLog('[ControlBar]', ...args);
          console.error = (...args) => originalError('[ControlBar]', ...args);
          console.info = (...args) => originalInfo('[ControlBar]', ...args);

          console.log('Script loaded');

          // Wait for API to be injected
          function init() {
            console.log('Initializing, checking for controlBarAPI:', !!window.controlBarAPI);

            if (!window.controlBarAPI) {
              console.log('API not ready, waiting...');
              setTimeout(init, 50);
              return;
            }

            console.log('API ready!');
            const controlBar = document.getElementById('controlBar');
            const startBtn = document.getElementById('startBtn');
            const dismissBtn = document.getElementById('dismissBtn');
            const toggleBtn = document.getElementById('toggleBtn');
            const endBtn = document.getElementById('endBtn');
            const stopBtn = document.getElementById('stopBtn');
            const statusText = document.getElementById('statusText');
            const statusIndicator = document.getElementById('statusIndicator');
            const micOnIcon = document.getElementById('micOnIcon');
            const micOffIcon = document.getElementById('micOffIcon');

            // Initial state
            updateButtons('${state}', true);

            // Expose functions to window so main process can call them
            window.updateButtonsFromMain = updateButtons;
            window.showProcessingFromMain = showProcessing;
            console.log('Main process functions exposed');

            // Track if start recording is already in progress
            let isStartingRecording = false;

            // Button click handlers
            startBtn.addEventListener('click', (e) => {
              console.log('Start button clicked', { isStartingRecording, disabled: startBtn.disabled });

              // Prevent double clicks with flag-based check
              if (isStartingRecording || startBtn.disabled) {
                console.log('Button action already in progress, ignoring click');
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
              }

              isStartingRecording = true;
              startBtn.disabled = true;
              const originalText = startBtn.textContent;
              startBtn.innerHTML = '<span class="button-spinner"></span>Starting...';

              if (window.controlBarAPI) {
                window.controlBarAPI.startRecording();
              } else {
                console.error('controlBarAPI not available!');
                // Re-enable button if API call fails
                isStartingRecording = false;
                startBtn.disabled = false;
                startBtn.textContent = originalText;
              }
            });

            dismissBtn.addEventListener('click', () => {
              console.log('Dismiss button clicked');
              if (window.controlBarAPI) {
                window.controlBarAPI.dismissMeeting();
              } else {
                console.error('controlBarAPI not available!');
              }
            });

            toggleBtn.addEventListener('click', () => {
              console.log('Toggle button clicked');
              if (window.controlBarAPI) {
                window.controlBarAPI.toggleRecord();
              } else {
                console.error('controlBarAPI not available!');
              }
            });

            endBtn.addEventListener('click', () => {
              console.log('Stop button clicked');
              if (window.controlBarAPI) {
                window.controlBarAPI.endMeeting();
              } else {
                console.error('controlBarAPI not available!');
              }
            });

            stopBtn.addEventListener('click', () => {
              console.log('Stop button clicked');
              if (window.controlBarAPI) {
                window.controlBarAPI.stopRecording();
              } else {
                console.error('controlBarAPI not available!');
              }
            });

            function updateButtons(state, isOnRecord) {
              console.log('updateButtons state:', state, 'isOnRecord:', isOnRecord);
              if (state === 'recording') {
                // When recording, show end button (toggle button hidden for now)
                startBtn.style.display = 'none';
                // Reset start button state in case it was loading
                isStartingRecording = false;
                startBtn.disabled = false;
                startBtn.textContent = 'Start Recording';
                dismissBtn.style.display = 'none';
                toggleBtn.style.display = 'none'; // Hidden - feature temporarily disabled
                endBtn.style.display = 'block';
                stopBtn.style.display = 'none';

                // Show mic-on icon when actively recording
                statusIndicator.style.display = 'none';
                micOnIcon.style.display = 'block';
                micOffIcon.style.display = 'none';
              } else if (state === 'detected' || state === 'idle') {
                // When detected, show start and dismiss buttons
                startBtn.style.display = 'block';
                dismissBtn.style.display = 'block';
                toggleBtn.style.display = 'none';
                endBtn.style.display = 'none';
                stopBtn.style.display = 'none';
                // Show pulsing indicator when prompting
                statusIndicator.style.display = 'block';
                micOnIcon.style.display = 'none';
                micOffIcon.style.display = 'none';
              } else {
                // Other states, hide all buttons
                startBtn.style.display = 'none';
                dismissBtn.style.display = 'none';
                toggleBtn.style.display = 'none';
                endBtn.style.display = 'none';
                stopBtn.style.display = 'none';
                // Default to pulsing indicator
                statusIndicator.style.display = 'block';
                micOnIcon.style.display = 'none';
                micOffIcon.style.display = 'none';
              }
            }

            function showProcessing(message) {
              console.log('showProcessing called with message:', message);
              // Add processing class to show spinner and hide other elements
              controlBar.classList.add('processing');
              // Set the status text
              statusText.textContent = message;
              // Hide all buttons
              startBtn.style.display = 'none';
              dismissBtn.style.display = 'none';
              toggleBtn.style.display = 'none';
              endBtn.style.display = 'none';
              stopBtn.style.display = 'none';
              // Hide all indicator icons - only spinner should show
              statusIndicator.style.display = 'none';
              micOnIcon.style.display = 'none';
              micOffIcon.style.display = 'none';
            }
          }

          // Start initialization
          init();
        </script>
      </body>
    </html>
  `;
}
