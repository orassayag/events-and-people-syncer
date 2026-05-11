import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncPhonesScript } from '../syncPhones';
import { AuthService } from '../../services/auth';
import * as utils from '../../utils';

vi.mock('../../services/contacts');
vi.mock('../../services/auth');
vi.mock('../../logging');
vi.mock('../../utils');

describe('SyncPhonesScript', () => {
  let script: SyncPhonesScript;
  let mockContactEditor: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContactEditor = {
      getContactFirstLabel: vi.fn(),
      addPhonesToContact: vi.fn(),
    };
    script = new SyncPhonesScript(mockContactEditor as any);

    // Mock AuthService
    (AuthService as any).prototype.authorize = vi
      .fn()
      .mockResolvedValue(undefined);
  });

  it('should successfully sync phones and deduplicate the entered list', async () => {
    // Mock user inputs with duplicate numbers
    vi.mocked(utils.inputWithEscape)
      .mockResolvedValueOnce({ value: 'c123', escaped: false }) // Contact ID
      .mockResolvedValueOnce({
        value: '0521234567, 031234567, 0521234567', // One duplicate
        escaped: false,
      }); // Phones

    mockContactEditor.getContactFirstLabel.mockResolvedValue('My Label');
    mockContactEditor.addPhonesToContact.mockResolvedValue(2);

    await script.run();

    expect(mockContactEditor.getContactFirstLabel).toHaveBeenCalledWith('c123');
    // Verify that addPhonesToContact was called with only 2 unique numbers
    expect(mockContactEditor.addPhonesToContact).toHaveBeenCalledWith(
      'c123',
      ['0521234567', '031234567'],
      'My Label'
    );
  });

  it('should handle contact not found and prompt for ID again', async () => {
    vi.mocked(utils.inputWithEscape)
      .mockResolvedValueOnce({ value: 'invalid-id', escaped: false }) // First attempt ID
      .mockResolvedValueOnce({ escaped: true }); // Second attempt ESC (to break loop)

    mockContactEditor.getContactFirstLabel.mockRejectedValueOnce(
      new Error('Contact not found')
    );

    await script.run();

    expect(mockContactEditor.getContactFirstLabel).toHaveBeenCalledWith(
      'invalid-id'
    );
    // Verify it called inputWithEscape a second time
    expect(utils.inputWithEscape).toHaveBeenCalledTimes(2);
  });

  it('should exit when user escapes during Contact ID input', async () => {
    vi.mocked(utils.inputWithEscape).mockResolvedValueOnce({
      escaped: true,
    });

    await script.run();

    expect(mockContactEditor.getContactFirstLabel).not.toHaveBeenCalled();
  });

  it('should handle error if no valid phones are entered and prompt for ID again', async () => {
    vi.mocked(utils.inputWithEscape)
      .mockResolvedValueOnce({ value: 'c123', escaped: false }) // Contact ID
      .mockResolvedValueOnce({ value: '  ,  ', escaped: false }) // Invalid phones
      .mockResolvedValueOnce({ escaped: true }); // Break loop

    mockContactEditor.getContactFirstLabel.mockResolvedValue('Label');

    await script.run();

    expect(mockContactEditor.addPhonesToContact).not.toHaveBeenCalled();
    expect(utils.inputWithEscape).toHaveBeenCalledTimes(3);
  });
});
