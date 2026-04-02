import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auto-updater tests
 *
 * These tests verify the auto-updater configuration and basic functionality.
 * Note: Full integration testing requires a packaged build and GitHub releases.
 */
describe('AutoUpdateService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should have correct configuration in package.json', async () => {
    const packageJson = await import('../../package.json');

    expect(packageJson.build).toBeDefined();
    expect(packageJson.build.publish).toBeDefined();
    expect(packageJson.build.publish[0].provider).toBe('github');
    expect(packageJson.build.publish[0].owner).toBe('om-labs');
    expect(packageJson.build.publish[0].repo).toBe('om-releases');
  });

  it('should have repository field configured', async () => {
    const packageJson = await import('../../package.json');

    expect(packageJson.repository).toBeDefined();
    expect(packageJson.repository.type).toBe('git');
    expect(packageJson.repository.url).toBe(
      'https://github.com/om-labs/om-desktop.git'
    );
  });

  it('should have electron-updater as a dependency', async () => {
    const packageJson = await import('../../package.json');

    expect(packageJson.dependencies['electron-updater']).toBeDefined();
  });

  it('should have NODE_ENV configured', () => {
    // In test environment, NODE_ENV should be set
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

describe('Update Configuration', () => {
  it('should have dev-app-update.yml file', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.join(process.cwd(), 'dev-app-update.yml');
    const exists = fs.existsSync(configPath);

    expect(exists).toBe(true);

    if (exists) {
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('owner: om-labs');
      expect(content).toContain('repo: om-releases');
      expect(content).toContain('provider: github');
    }
  });

  it('should have proper app ID configured', async () => {
    const packageJson = await import('../../package.json');

    expect(packageJson.build.appId).toBe('com.electron.om');
  });
});
