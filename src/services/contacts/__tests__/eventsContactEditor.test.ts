import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsContactEditor } from '../eventsContactEditor';
import type { EditableContactData } from '../contactEditor';

const mockAuth = {} as any;
const mockDuplicateDetector = {} as any;

describe('EventsContactEditor', () => {
  let editor: EventsContactEditor;

  beforeEach(() => {
    editor = new EventsContactEditor(mockAuth, mockDuplicateDetector);
    vi.clearAllMocks();
  });

  describe('collectInitialInput', () => {
    it('should call parent method when no prePopulated data provided', async () => {
      const parentMethod = vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(editor)),
        'collectInitialInput'
      );
      const expectedData: EditableContactData = {
        firstName: 'John',
        lastName: 'Doe',
        company: '',
        jobTitle: undefined,
        emails: [],
        phones: [],
        linkedInUrl: undefined,
        labelResourceNames: [],
      };
      parentMethod.mockResolvedValue(expectedData);
      const result = await editor.collectInitialInput();
      expect(parentMethod).toHaveBeenCalled();
      expect(result).toEqual(expectedData);
    });

    it('should call parent method when empty prePopulated object provided', async () => {
      const parentMethod = vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(editor)),
        'collectInitialInput'
      );
      const expectedData: EditableContactData = {
        firstName: 'John',
        lastName: 'Doe',
        company: '',
        jobTitle: undefined,
        emails: [],
        phones: [],
        linkedInUrl: undefined,
        labelResourceNames: [],
      };
      parentMethod.mockResolvedValue(expectedData);
      const result = await editor.collectInitialInput({});
      expect(parentMethod).toHaveBeenCalled();
      expect(result).toEqual(expectedData);
    });
  });
});
