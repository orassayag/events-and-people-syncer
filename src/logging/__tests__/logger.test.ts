import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '..';
import { EMOJIS } from '../../constants';

describe('Logger Display Methods', () => {
  let logger: Logger;
  let consoleLogSpy: any;

  beforeEach(() => {
    logger = new Logger('test');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('display()', () => {
    it('should format display messages with === markers', () => {
      logger.display('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Test message===');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
    });

    it('should throw error for empty messages', () => {
      expect(() => logger.display('')).toThrow(
        'Display message cannot be empty'
      );
      expect(() => logger.display('   ')).toThrow(
        'Display message cannot be empty'
      );
      expect(() => logger.display('===')).toThrow(
        'Display message cannot be empty'
      );
    });

    it('should not add extra blank before message at init', () => {
      consoleLogSpy.mockClear();
      logger.display('First message');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0]).toBe('===First message===');
      expect(calls[1]).toBe('');
    });
  });

  describe('displayError()', () => {
    it(`should auto-add ${EMOJIS.STATUS.ERROR} emoji for errors`, () => {
      logger.displayError('Error message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `===${EMOJIS.STATUS.ERROR} Error message===`
      );
    });

    it(`should not duplicate ${EMOJIS.STATUS.ERROR} if already present`, () => {
      logger.displayError(`${EMOJIS.STATUS.ERROR} Error message`);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `===${EMOJIS.STATUS.ERROR} Error message===`
      );
    });
  });

  describe('displayMultiLine()', () => {
    it('should display multiple lines with separate === markers', () => {
      logger.displayMultiLine(['Line 1', 'Line 2', 'Line 3']);
      expect(consoleLogSpy).toHaveBeenCalledWith('===Line 1===');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Line 2===');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Line 3===');
      expect(consoleLogSpy).toHaveBeenCalledWith('');
    });

    it('should throw error for empty array', () => {
      expect(() => logger.displayMultiLine([])).toThrow(
        'displayMultiLine requires at least one line'
      );
    });
  });

  describe('cleanMessage()', () => {
    it('should remove trailing periods', () => {
      logger.display('Message with period.');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Message with period===');
    });

    it('should remove multiple trailing periods (ellipsis)', () => {
      logger.display('Message with ellipsis...');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Message with ellipsis===');
    });

    it('should convert internal newlines to spaces', () => {
      logger.display('Line 1\nLine 2\nLine 3');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Line 1 Line 2 Line 3===');
    });

    it('should remove === markers from input', () => {
      logger.display('===Already formatted===');
      expect(consoleLogSpy).toHaveBeenCalledWith('===Already formatted===');
    });

    it('should remove leading and trailing \\n', () => {
      logger.display('\n← Going back...\n');
      expect(consoleLogSpy).toHaveBeenCalledWith('===← Going back===');
    });
  });

  describe('resetState()', () => {
    it('should prevent blank line before message after spinner', () => {
      consoleLogSpy.mockClear();
      logger.resetState('spinner');
      logger.display('After spinner');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0]).toBe('===After spinner===');
      expect(calls[1]).toBe('');
    });

    it('should allow normal spacing after non-spinner state', () => {
      consoleLogSpy.mockClear();
      logger.display('Message 1');
      consoleLogSpy.mockClear();
      logger.display('Message 2');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0]).toBe('');
      expect(calls[1]).toBe('===Message 2===');
      expect(calls[2]).toBe('');
    });

    it('should prevent blank line after menu state', () => {
      consoleLogSpy.mockClear();
      logger.resetState('menu');
      logger.display('After menu');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0]).toBe('===After menu===');
      expect(calls[1]).toBe('');
    });
  });

  describe('breakline()', () => {
    it('should prevent duplicate breaklines', () => {
      consoleLogSpy.mockClear();
      logger.breakline();
      logger.breakline();
      logger.breakline();
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('');
    });

    it('should allow display after breakline without extra blank', () => {
      consoleLogSpy.mockClear();
      logger.breakline();
      consoleLogSpy.mockClear();
      logger.display('After breakline');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0]).toBe('===After breakline===');
    });
  });

  describe('specialized emoji methods', () => {
    it('displayWarning should add ⚠️', () => {
      logger.displayWarning('Warning');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('===⚠️  Warning===');
    });

    it('displaySuccess should add ✅', () => {
      logger.displaySuccess('Success');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('===✅ Success===');
    });

    it('displayClipboard should add 📋', () => {
      logger.displayClipboard('Clipboard');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('===📋 Clipboard===');
    });

    it('displayCleanup should add ♻️', () => {
      logger.displayCleanup('Cleanup');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('===♻️  Cleanup===');
    });

    it('displayGoBack should add ⬅️', () => {
      logger.displayGoBack();
      expect(consoleLogSpy).toHaveBeenCalledWith('===⬅️ Going back===');
    });
  });

  describe('concurrent display calls', () => {
    it('should handle rapid sequential messages correctly', () => {
      consoleLogSpy.mockClear();
      logger.display('Message 1');
      logger.display('Message 2');
      logger.display('Message 3');
      const calls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);

      expect(calls[0]).toBe('===Message 1===');
      expect(calls[1]).toBe('');

      expect(calls[2]).toBe('');
      expect(calls[3]).toBe('===Message 2===');
      expect(calls[4]).toBe('');

      expect(calls[5]).toBe('');
      expect(calls[6]).toBe('===Message 3===');
      expect(calls[7]).toBe('');
    });
  });
});
