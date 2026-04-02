#!/usr/bin/env node

/**
 * Link electron from monorepo root to local node_modules
 *
 * In npm workspaces, electron gets hoisted to the root node_modules,
 * but electron-forge expects it in the workspace's node_modules.
 * This script creates a symlink to fix that.
 */

const fs = require('fs');
const path = require('path');

const localNodeModules = path.join(__dirname, '..', 'node_modules');
const localElectron = path.join(localNodeModules, 'electron');
const rootElectron = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'electron'
);

// Check if we're in a monorepo (root electron exists)
if (!fs.existsSync(rootElectron)) {
  console.log(
    '[link-electron] Not in monorepo or electron not installed at root, skipping'
  );
  process.exit(0);
}

// Check if local electron already exists and is valid
if (fs.existsSync(localElectron)) {
  const stats = fs.lstatSync(localElectron);
  if (stats.isSymbolicLink()) {
    const target = fs.readlinkSync(localElectron);
    if (
      target === rootElectron ||
      fs.realpathSync(localElectron) === fs.realpathSync(rootElectron)
    ) {
      console.log('[link-electron] Symlink already exists and is correct');
      process.exit(0);
    }
    // Wrong symlink, remove it
    fs.unlinkSync(localElectron);
  } else if (stats.isDirectory()) {
    // Real directory exists, check if it has electron binary
    const electronBinary = path.join(localElectron, 'dist');
    if (fs.existsSync(electronBinary)) {
      console.log(
        '[link-electron] Local electron installation exists, skipping'
      );
      process.exit(0);
    }
  }
}

// Ensure node_modules directory exists
if (!fs.existsSync(localNodeModules)) {
  fs.mkdirSync(localNodeModules, { recursive: true });
}

// Create symlink
try {
  fs.symlinkSync(rootElectron, localElectron, 'junction');
  console.log('[link-electron] Created symlink to root electron');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('[link-electron] Symlink already exists');
  } else {
    console.error('[link-electron] Failed to create symlink:', error.message);
    process.exit(1);
  }
}
