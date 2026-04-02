/**
 * electron-builder afterPack hook
 * Fixes NSAppTransportSecurity settings that aren't properly merged via extendInfo
 */
const fs = require('fs');
const path = require('path');
const plist = require('plist');

exports.default = async function (context) {
  // Only run for macOS builds
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');

  console.log(`[afterPack] Fixing NSAppTransportSecurity in: ${infoPlistPath}`);

  try {
    // Read the current Info.plist
    const infoPlistContent = fs.readFileSync(infoPlistPath, 'utf8');
    const infoPlist = plist.parse(infoPlistContent);

    // Override NSAppTransportSecurity with secure settings
    infoPlist.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        'supabase.co': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
        },
        'posthog.com': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
        },
        'sentry.io': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
        },
        'intercom.io': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionRequiresForwardSecrecy: true,
        },
      },
    };

    // Write the modified Info.plist back
    const updatedContent = plist.build(infoPlist);
    fs.writeFileSync(infoPlistPath, updatedContent, 'utf8');

    console.log('[afterPack] NSAppTransportSecurity fixed successfully');
    console.log('[afterPack] NSAllowsArbitraryLoads is now: false');
  } catch (error) {
    console.error('[afterPack] Failed to fix NSAppTransportSecurity:', error);
    throw error;
  }
};
