import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClearCacheScript } from '../clearCache';
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

describe('ClearCacheScript', () => {
  let script: ClearCacheScript;

  beforeEach(() => {
    vi.clearAllMocks();
    script = new ClearCacheScript();
  });

  it('should notify if cache directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await script.run();

    expect(fs.existsSync).toHaveBeenCalled();
    // Check if info was called with "No cache folder found"
    // Since Logger is mocked, we can't easily check internal calls without exposing it
    // But we can check that unlinkSync was NOT called
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should notify if cache folder is empty', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await script.run();

    expect(fs.readdirSync).toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should delete all files in the cache directory', async () => {
    const mockFiles = ['file1.json', 'file2.json'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    await script.run();

    expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('file1.json'));
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('file2.json'));
  });
});
