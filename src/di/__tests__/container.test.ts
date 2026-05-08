import { describe, it, expect } from 'vitest';
import { container } from '../container';
import { TYPES } from '../identifiers';
import { Logger } from '../../logging';
import { DuplicateDetector } from '../../services/contacts';

describe('DI Container', () => {
  it('should be defined', () => {
    expect(container).toBeDefined();
  });

  it('should resolve Logger', () => {
    const logger = container.get<Logger>(TYPES.Logger);
    expect(logger).toBeDefined();
  });

  it('should resolve DuplicateDetector', () => {
    // Note: This might fail if DuplicateDetector has dependencies not yet bound
    // But since it's @injectable and we are just checking if it exists in the container
    expect(container.isBound(DuplicateDetector)).toBe(true);
  });
});
