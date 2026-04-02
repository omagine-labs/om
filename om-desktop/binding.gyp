{
  "targets": [
    {
      "target_name": "screen_recorder",
      "sources": [
        "native/addon/screen_recorder.mm",
        "native/addon/binding.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_CFLAGS": [
                "-fobjc-arc",
                "-ObjC++"
              ]
            },
            "link_settings": {
              "libraries": [
                "-framework ScreenCaptureKit",
                "-framework AVFoundation",
                "-framework CoreMedia",
                "-framework CoreVideo",
                "-framework Foundation"
              ]
            }
          }
        ]
      ]
    },
    {
      "target_name": "window_detector",
      "sources": [
        "native/window-detector/window_detector.mm",
        "native/window-detector/binding.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_CFLAGS": [
                "-fobjc-arc",
                "-ObjC++"
              ]
            },
            "link_settings": {
              "libraries": [
                "-framework ApplicationServices",
                "-framework AppKit",
                "-framework CoreGraphics",
                "-framework CoreAudio",
                "-framework Foundation"
              ]
            }
          }
        ]
      ]
    },
    {
      "target_name": "menu_bar_appearance",
      "sources": [
        "native/menu-bar-appearance/menu_bar_appearance.mm",
        "native/menu-bar-appearance/binding.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_CFLAGS": [
                "-fobjc-arc",
                "-ObjC++"
              ]
            },
            "link_settings": {
              "libraries": [
                "-framework AppKit",
                "-framework Foundation"
              ]
            }
          }
        ]
      ]
    }
  ]
}
