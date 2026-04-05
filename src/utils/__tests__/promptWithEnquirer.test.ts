import { describe, it, expect, vi, beforeEach } from 'vitest';
import Enquirer from 'enquirer';
import {
  selectWithEscape,
  inputWithEscape,
  confirmWithEscape,
  checkboxWithEscape,
  searchableSelectWithEscape,
} from '../promptWithEnquirer';

let mockCheckboxResult: { escaped: boolean; value?: string[] } = { escaped: false, value: [] };
let mockSelectResult: { escaped: boolean; value?: string } = { escaped: false, value: '' };

vi.mock('enquirer');
vi.mock('../searchableMultiselect', () => ({
  SearchableMultiSelect: class MockSearchableMultiSelect {
    constructor(public config: any) {}

    async run(): Promise<string[]> {
      if (mockCheckboxResult.escaped) {
        throw new Error('cancelled');
      }
      return mockCheckboxResult.value || [];
    }
  },
}));

vi.mock('../searchableSelect', () => ({
  SearchableSelect: class MockSearchableSelect {
    constructor(public config: any) {}

    async run(): Promise<string> {
      if (mockSelectResult.escaped) {
        throw new Error('cancelled');
      }
      return mockSelectResult.value || '';
    }
  },
}));

describe('promptWithEnquirer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckboxResult = { escaped: false, value: [] };
    mockSelectResult = { escaped: false, value: '' };
  });
  describe('PromptResult type structure', () => {
    it('should return escaped true when user presses ESC', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await selectWithEscape({
        message: 'Test',
        choices: [{ value: 'opt1' }],
      });
      expect(result.escaped).toBe(true);
      expect('value' in result).toBe(false);
    });
    it('should return escaped false with value when user completes prompt', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'opt1',
      });
      const result = await selectWithEscape({
        message: 'Test',
        choices: [{ value: 'opt1' }],
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('opt1');
      }
    });
  });
  describe('selectWithEscape', () => {
    it('should return value when selection is made', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'Option 1',
      });
      const result = await selectWithEscape({
        message: 'Select option',
        choices: [
          { value: 'option1', name: 'Option 1' },
          { value: 'option2', name: 'Option 2' },
        ],
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('option1');
      }
    });
    it('should return escaped true when user presses ESC', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await selectWithEscape({
        message: 'Select option',
        choices: [{ value: 'opt1' }],
      });
      expect(result.escaped).toBe(true);
    });
    it('should handle choices without name property', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'opt1',
      });
      const result = await selectWithEscape({
        message: 'Select',
        choices: [{ value: 'opt1' }, { value: 'opt2' }],
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('opt1');
      }
    });
  });
  describe('inputWithEscape', () => {
    it('should return value when input is provided', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'John Doe',
      });
      const result = await inputWithEscape({
        message: 'Enter name',
        default: '',
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('John Doe');
      }
    });
    it('should return escaped true when user presses ESC', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await inputWithEscape({
        message: 'Enter name',
      });
      expect(result.escaped).toBe(true);
    });
    it('should work with validation function', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'valid@email.com',
      });
      const validateFn = (input: string): boolean | string =>
        input.includes('@') || 'Invalid email';
      const result = await inputWithEscape({
        message: 'Email',
        validate: validateFn,
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('valid@email.com');
      }
    });
  });
  describe('confirmWithEscape', () => {
    it('should return true when confirmed', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({ value: true });
      const result = await confirmWithEscape({
        message: 'Confirm?',
        default: true,
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe(true);
      }
    });
    it('should return false when declined', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: false,
      });
      const result = await confirmWithEscape({
        message: 'Confirm?',
        default: false,
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe(false);
      }
    });
    it('should return escaped true when user presses ESC', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await confirmWithEscape({
        message: 'Confirm?',
      });
      expect(result.escaped).toBe(true);
    });
  });
  describe('checkboxWithEscape', () => {
    it('should return selected items', async () => {
      mockCheckboxResult = { escaped: false, value: ['Label 1', 'Label 2'] };
      const result = await checkboxWithEscape({
        message: 'Select labels',
        choices: [
          { value: 'label1', name: 'Label 1' },
          { value: 'label2', name: 'Label 2' },
          { value: 'label3', name: 'Label 3' },
        ],
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toEqual(['label1', 'label2']);
      }
    });
    it('should return escaped true when user presses ESC', async () => {
      mockCheckboxResult = { escaped: true };
      const result = await checkboxWithEscape({
        message: 'Select labels',
        choices: [{ value: 'label1' }],
      });
      expect(result.escaped).toBe(true);
    });
    it('should work with validation', async () => {
      mockCheckboxResult = { escaped: false, value: ['label1'] };
      const validateFn = (items: string[]): boolean | string =>
        items.length > 0 || 'Select at least one';
      const result = await checkboxWithEscape({
        message: 'Select',
        choices: [{ value: 'label1' }],
        validate: validateFn,
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toEqual(['label1']);
      }
    });
  });
  describe('searchableSelectWithEscape', () => {
    it('should return selected item', async () => {
      mockSelectResult = { escaped: false, value: 'Label 1' };
      const result = await searchableSelectWithEscape({
        message: 'Select label',
        choices: [
          { value: 'label1', name: 'Label 1' },
          { value: 'label2', name: 'Label 2' },
        ],
      });
      expect(result.escaped).toBe(false);
      if (!result.escaped) {
        expect(result.value).toBe('label1');
      }
    });
    it('should return escaped true when user presses ESC', async () => {
      mockSelectResult = { escaped: true };
      const result = await searchableSelectWithEscape({
        message: 'Select label',
        choices: [{ value: 'label1' }],
      });
      expect(result.escaped).toBe(true);
    });
  });
  describe('ESC with default values', () => {
    it('should return escaped true, not the default value', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await confirmWithEscape({
        message: 'Confirm?',
        default: true,
      });
      expect(result.escaped).toBe(true);
      expect('value' in result).toBe(false);
    });
    it('should return escaped true for input with default', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await inputWithEscape({
        message: 'Enter name',
        default: 'John Doe',
      });
      expect(result.escaped).toBe(true);
      expect('value' in result).toBe(false);
    });
  });
  describe('Sequential prompts', () => {
    it('should allow sequential prompts without issues', async () => {
      const promptSpy = vi.spyOn((Enquirer as any).prototype, 'prompt');
      promptSpy.mockResolvedValueOnce({ value: 'option1' });
      promptSpy.mockResolvedValueOnce({ value: 'test input' });
      promptSpy.mockResolvedValueOnce({ value: true });
      const result1 = await selectWithEscape({
        message: 'Select',
        choices: [{ value: 'option1' }],
      });
      const result2 = await inputWithEscape({
        message: 'Input',
      });
      const result3 = await confirmWithEscape({
        message: 'Confirm',
      });
      expect(result1.escaped).toBe(false);
      expect(result2.escaped).toBe(false);
      expect(result3.escaped).toBe(false);
    });
    it('should handle ESC in middle of sequential flow', async () => {
      const promptSpy = vi.spyOn((Enquirer as any).prototype, 'prompt');
      promptSpy.mockResolvedValueOnce({ value: 'option1' });
      promptSpy.mockRejectedValueOnce(new Error('cancelled'));
      const result1 = await selectWithEscape({
        message: 'Select',
        choices: [{ value: 'option1' }],
      });
      expect(result1.escaped).toBe(false);
      const result2 = await inputWithEscape({
        message: 'Input',
      });
      expect(result2.escaped).toBe(true);
    });
  });
  describe('TypeScript type narrowing', () => {
    it('should allow accessing value when escaped is false', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockResolvedValue({
        value: 'opt1',
      });
      const result = await selectWithEscape({
        message: 'Test',
        choices: [{ value: 'opt1' }],
      });
      if (!result.escaped) {
        const value: string = result.value;
        expect(value).toBe('opt1');
      }
    });
    it('should not allow accessing value when escaped is true', async () => {
      vi.spyOn((Enquirer as any).prototype, 'prompt').mockRejectedValue(
        new Error('cancelled')
      );
      const result = await selectWithEscape({
        message: 'Test',
        choices: [{ value: 'opt1' }],
      });
      expect(result.escaped).toBe(true);
      if (result.escaped) {
        expect('value' in result).toBe(false);
      }
    });
  });
});
