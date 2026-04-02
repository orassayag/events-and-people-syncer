import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AlertLogger } from './alertLogger';
import { LOG_CONFIG } from './logConfig';

const TEST_SCRIPT_NAME = 'test-script';
const TEST_FILE_PATH = join(LOG_CONFIG.logDir, `${TEST_SCRIPT_NAME}_ALERTS.log`);

async function cleanupTestFile(): Promise<void> {
  try {
    await fs.unlink(TEST_FILE_PATH);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function ensureLogsDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
  } catch {
  }
}

describe.sequential('AlertLogger', () => {
  beforeEach(async () => {
    await ensureLogsDir();
    await cleanupTestFile();
  });
  afterEach(async () => {
    await cleanupTestFile();
  });

  describe('initialization', () => {
    it('should initialize successfully when file does not exist', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      expect(logger.hasAlerts()).toBe(false);
      const counts = logger.getAlertCounts();
      expect(counts.total).toBe(0);
      expect(counts.warning).toBe(0);
      expect(counts.error).toBe(0);
      expect(counts.skipped).toBe(0);
    });

    it('should initialize successfully with existing empty file', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      await fs.writeFile(TEST_FILE_PATH, '', 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      expect(logger.hasAlerts()).toBe(false);
      const counts = logger.getAlertCounts();
      expect(counts.total).toBe(0);
    });

    it('should load existing alerts from file', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = `[WARNING] === Alert Entry ===
[WARNING] Index: 1
[WARNING] Timestamp: 2026-03-22T10:00:00.000Z
[WARNING] Contact:
[WARNING]   -FirstName: John
[WARNING]   -LastName: Doe
[WARNING]   -Email: john@example.com
[WARNING]   -LinkedIn URL: https://linkedin.com/in/johndoe
[WARNING]   -Company: Acme Corp
[WARNING] Reason: Test reason
[WARNING] === End Entry ===

`;
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      expect(logger.hasAlerts()).toBe(true);
      const counts = logger.getAlertCounts();
      expect(counts.warning).toBe(1);
      expect(counts.total).toBe(1);
    });
  });

  describe('writeAlert', () => {
    it('should write warning alert to file', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      }, 'Test warning');
      expect(logger.hasAlerts()).toBe(true);
      const content = await fs.readFile(TEST_FILE_PATH, 'utf-8');
      expect(content).toContain('[WARNING]');
      expect(content).toContain('Jane');
      expect(content).toContain('Smith');
      expect(content).toContain('jane@example.com');
      expect(content).toContain('Test warning');
    });

    it('should write error alert to file', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('error', {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob@example.com',
      }, 'API failure');
      const content = await fs.readFile(TEST_FILE_PATH, 'utf-8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('Bob');
      expect(content).toContain('API failure');
    });

    it('should write skipped alert to file', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('skipped', {
        firstName: 'Alice',
        lastName: 'Wonder',
      }, 'Missing email');
      const content = await fs.readFile(TEST_FILE_PATH, 'utf-8');
      expect(content).toContain('[SKIPPED]');
      expect(content).toContain('Alice');
      expect(content).toContain('Missing email');
    });

    it('should handle missing optional fields', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Test',
        lastName: 'User',
      }, 'No email or URL');
      const content = await fs.readFile(TEST_FILE_PATH, 'utf-8');
      expect(content).toContain('(none)');
    });

    it('should not write duplicate alerts in same run', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      const contact = { firstName: 'Duplicate', lastName: 'Contact', email: 'dup@example.com' };
      await logger.writeAlert('warning', contact, 'First alert');
      await logger.writeAlert('warning', contact, 'Second alert');
      const counts = logger.getAlertCounts();
      expect(counts.warning).toBe(1);
    });
  });

  describe('contact matching', () => {
    it('should match contacts by email (case-insensitive)', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@EXAMPLE.com',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN@example.com',
      })).toBe(true);
    });

    it('should match contacts with trimmed email', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: '  jane@example.com  ',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })).toBe(true);
    });

    it('should match contacts by name + URL', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Bob',
        lastName: 'Johnson',
        url: 'https://linkedin.com/in/bobjohnson',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'Bob',
        lastName: 'Johnson',
        url: 'https://www.linkedin.com/in/bobjohnson/',
      })).toBe(true);
    });

    it('should match contacts by name only when both missing email and URL', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Alice',
        lastName: 'Wonder',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'Alice',
        lastName: 'Wonder',
      })).toBe(true);
    });

    it('should normalize Unicode characters in names (NFC)', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'José',
        lastName: 'García',
        email: 'jose@example.com',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'José',
        lastName: 'García',
        email: 'jose@example.com',
      })).toBe(true);
    });

    it('should match names with extra spaces', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'John  Paul',
        lastName: 'Smith',
        email: 'jp@example.com',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'John Paul',
        lastName: 'Smith',
        email: 'jp@example.com',
      })).toBe(true);
    });

    it('should not match contacts with invalid email (no @)', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Invalid',
        lastName: 'Email',
        email: 'notanemail',
      }, 'Test');
      expect(logger.isAlertedContact({
        firstName: 'Different',
        lastName: 'Person',
        email: 'valid@example.com',
      })).toBe(false);
    });
  });

  describe('file operations', () => {
    it('should delete alert file successfully', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
      }, 'Test');
      expect(logger.hasAlerts()).toBe(true);
      await logger.deleteAlertFile();
      expect(logger.hasAlerts()).toBe(false);
      await expect(fs.access(TEST_FILE_PATH)).rejects.toThrow();
    });

    it('should remove specific alert by index', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'First',
        lastName: 'Alert',
        email: 'first@example.com',
      }, 'Test 1');
      await logger.writeAlert('error', {
        firstName: 'Second',
        lastName: 'Alert',
        email: 'second@example.com',
      }, 'Test 2');
      const allAlerts = logger.getAllAlerts();
      const totalBefore = allAlerts.warnings.length + allAlerts.errors.length;
      expect(totalBefore).toBe(2);
      await logger.removeAlertByIndex(1);
      const allAlertsAfter = logger.getAllAlerts();
      const totalAfter = allAlertsAfter.warnings.length + allAlertsAfter.errors.length;
      expect(totalAfter).toBe(1);
    });

    it('should handle removing non-existent index gracefully', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
      }, 'Test');
      await logger.removeAlertByIndex(999);
      expect(logger.hasAlerts()).toBe(true);
    });

    it('should delete file when removing last alert', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'Only',
        lastName: 'Alert',
        email: 'only@example.com',
      }, 'Test');
      await logger.removeAlertByIndex(1);
      await expect(fs.access(TEST_FILE_PATH)).rejects.toThrow();
    });
  });

  describe('alert counts and retrieval', () => {
    it('should return correct alert counts', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', { firstName: 'W1', lastName: 'User', email: 'w1@example.com' }, 'Test');
      await logger.writeAlert('warning', { firstName: 'W2', lastName: 'User', email: 'w2@example.com' }, 'Test');
      await logger.writeAlert('error', { firstName: 'E1', lastName: 'User', email: 'e1@example.com' }, 'Test');
      await logger.writeAlert('skipped', { firstName: 'S1', lastName: 'User', email: 's1@example.com' }, 'Test');
      const counts = logger.getAlertCounts();
      expect(counts.warning).toBe(2);
      expect(counts.error).toBe(1);
      expect(counts.skipped).toBe(1);
      expect(counts.total).toBe(4);
    });

    it('should return all alerts grouped by type', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', { firstName: 'W1', lastName: 'User', email: 'w1@example.com' }, 'Test');
      await logger.writeAlert('error', { firstName: 'E1', lastName: 'User', email: 'e1@example.com' }, 'Test');
      const allAlerts = logger.getAllAlerts();
      expect(allAlerts.warnings.length).toBe(1);
      expect(allAlerts.errors.length).toBe(1);
      expect(allAlerts.skipped.length).toBe(0);
    });

    it('should return only current run alerts', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = `[WARNING] === Alert Entry ===
[WARNING] Index: 1
[WARNING] Timestamp: 2026-03-20T10:00:00.000Z
[WARNING] Contact:
[WARNING]   -FirstName: Historical
[WARNING]   -LastName: Alert
[WARNING]   -Email: old@example.com
[WARNING] Reason: Old alert
[WARNING] === End Entry ===

`;
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      const countsBeforeWrite = logger.getAlertCounts();
      expect(countsBeforeWrite.warning).toBe(1);
      await logger.writeAlert('warning', { firstName: 'New', lastName: 'Alert', email: 'new@example.com' }, 'New');
      const currentRun = logger.getCurrentRunAlerts();
      expect(currentRun.warnings.length).toBe(1);
      expect(currentRun.warnings[0].contact.firstName).toBe('New');
      const all = logger.getAllAlerts();
      expect(all.warnings.length).toBe(2);
    });

    it('should return alerts by type with pagination', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      for (let i = 1; i <= 15; i++) {
        await logger.writeAlert('warning', {
          firstName: `User${i}`,
          lastName: 'Test',
          email: `user${i}@example.com`,
        }, 'Test');
      }
      const firstPage = logger.getAlertsByType('warning', 0, 10);
      expect(firstPage.length).toBe(10);
      const secondPage = logger.getAlertsByType('warning', 10, 10);
      expect(secondPage.length).toBe(5);
    });
  });

  describe('threshold detection', () => {
    it('should return false when alerts under 200', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', { firstName: 'Test', lastName: 'User', email: 'test@example.com' }, 'Test');
      expect(logger.exceedsThreshold()).toBe(false);
    });

    it('should return true when alerts exceed 200', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      for (let i = 1; i <= 201; i++) {
        await logger.writeAlert('warning', {
          firstName: `User${i}`,
          lastName: 'Test',
          email: `user${i}@example.com`,
        }, 'Test');
      }
      expect(logger.exceedsThreshold()).toBe(true);
    });
  });

  describe('previously alerted tracking', () => {
    it('should track previously alerted count', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      await logger.writeAlert('warning', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      }, 'Test');
      expect(logger.getPreviouslyAlertedCount()).toBe(0);
      logger.isAlertedContact({ firstName: 'John', lastName: 'Doe', email: 'john@example.com' });
      expect(logger.getPreviouslyAlertedCount()).toBe(1);
      logger.isAlertedContact({ firstName: 'John', lastName: 'Doe', email: 'john@example.com' });
      expect(logger.getPreviouslyAlertedCount()).toBe(2);
    });
  });

  describe('file corruption handling', () => {
    it('should skip corrupted entries and load valid ones', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = `[WARNING] === Alert Entry ===
[WARNING] Index: 1
[WARNING] Timestamp: 2026-03-22T10:00:00.000Z
[WARNING] Contact:
[WARNING]   -FirstName: Valid
[WARNING]   -LastName: Entry
[WARNING]   -Email: valid@example.com
[WARNING] Reason: Valid alert
[WARNING] === End Entry ===

[ERROR] === Alert Entry ===
CORRUPTED DATA HERE
[ERROR] === End Entry ===

[SKIPPED] === Alert Entry ===
[SKIPPED] Index: 3
[SKIPPED] Timestamp: 2026-03-22T10:00:00.000Z
[SKIPPED] Contact:
[SKIPPED]   -FirstName: Another
[SKIPPED]   -LastName: Valid
[SKIPPED]   -Email: another@example.com
[SKIPPED] Reason: Another valid
[SKIPPED] === End Entry ===

`;
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      const counts = logger.getAlertCounts();
      expect(counts.warning).toBe(1);
      expect(counts.skipped).toBe(1);
      expect(counts.error).toBe(0);
      expect(counts.total).toBe(2);
      expect(logger.hasAlerts()).toBe(true);
    });

    it('should handle file with no valid alert entry markers as empty file', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = 'COMPLETELY CORRUPTED FILE WITH NO VALID ENTRIES';
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      expect(logger.hasAlerts()).toBe(false);
      const counts = logger.getAlertCounts();
      expect(counts.total).toBe(0);
    });

    it('should throw error when file has alert markers but all entries are corrupted', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = `[WARNING] === Alert Entry ===
CORRUPTED DATA WITHOUT REQUIRED FIELDS
[WARNING] === End Entry ===

[ERROR] === Alert Entry ===
ALSO CORRUPTED
[ERROR] === End Entry ===
`;
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await expect(logger.initialize()).rejects.toThrow(/Alert file is fully corrupted/);
    });
  });

  describe('duplicate prevention', () => {
    it('should detect duplicate alerts in current run', async () => {
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      const contact = { firstName: 'Dup', lastName: 'Test', email: 'dup@example.com' };
      expect(logger.checkForDuplicateAlert(contact)).toBe(false);
      await logger.writeAlert('warning', contact, 'First');
      expect(logger.checkForDuplicateAlert(contact)).toBe(true);
    });

    it('should not detect historical alerts as duplicates in current run check', async () => {
      await fs.mkdir(LOG_CONFIG.logDir, { recursive: true });
      const content = `[WARNING] === Alert Entry ===
[WARNING] Index: 1
[WARNING] Timestamp: 2026-03-20T10:00:00.000Z
[WARNING] Contact:
[WARNING]   -FirstName: Historical
[WARNING]   -LastName: Contact
[WARNING]   -Email: hist@example.com
[WARNING] Reason: Old
[WARNING] === End Entry ===

`;
      await fs.writeFile(TEST_FILE_PATH, content, 'utf-8');
      const logger = new AlertLogger(TEST_SCRIPT_NAME);
      await logger.initialize();
      expect(logger.checkForDuplicateAlert({
        firstName: 'Historical',
        lastName: 'Contact',
        email: 'hist@example.com',
      })).toBe(false);
    });
  });
});
