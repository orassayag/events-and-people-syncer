import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClearLogsScript } from '../clearLogs';
import * as fs from 'fs';

// Mock fs and Logger
vi.mock('fs');
vi.mock('../logging', () => ({
  Logger: class {
    display = vi.fn();
    info = vi.fn();
    error = vi.fn();
    warn = vi.fn();
  },
}));

describe('ClearLogsScript', () => {
  let script: ClearLogsScript;

  beforeEach(() => {
    vi.clearAllMocks();
    script = new ClearLogsScript();
  });

  it('should notify if logs directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await script.run();

    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('should notify if logs folder is empty', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await script.run();

    expect(fs.readdirSync).toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('should delete all items in the logs directory', async () => {
    const mockItems = ['app.log', 'error.log', 'subfolder'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(mockItems as any);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);

    await script.run();

    expect(fs.rmSync).toHaveBeenCalledTimes(3);
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('app.log'), {
      recursive: true,
      force: true,
    });
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('subfolder'),
      { recursive: true, force: true }
    );
  });

  it('should handle errors during deletion', async () => {
    const mockItems = ['protected.log'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(mockItems as any);
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    // Should not throw, but log error internally
    await expect(script.run()).resolves.toBeUndefined();
    expect(fs.rmSync).toHaveBeenCalled();
  });
});
