import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInExporterScript } from '../linkedinExporter';
import { selectWithEscape } from '../../utils';
import { promises as fs } from 'fs';

// Mock dependencies
vi.mock('../../services/linkedin');
vi.mock('../../utils', () => ({
  selectWithEscape: vi.fn(),
}));
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));
vi.mock('../../logging', () => ({
  Logger: class {
    display = vi.fn();
    displayError = vi.fn();
    displaySuccess = vi.fn();
    displayWarning = vi.fn();
  },
}));

describe('LinkedInExporterScript', () => {
  let script: LinkedInExporterScript;
  let mockExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractor = {
      extract: vi.fn(),
    };
    script = new LinkedInExporterScript(mockExtractor);
  });

  it('should handle extraction failure', async () => {
    mockExtractor.extract.mockRejectedValue(new Error('Extraction failed'));

    await script.run();

    expect(mockExtractor.extract).toHaveBeenCalled();
    // Verify that the script returns early and doesn't proceed to selection
    expect(selectWithEscape).not.toHaveBeenCalled();
  });

  it('should export company names successfully', async () => {
    const mockConnections = [
      { firstName: 'John', lastName: 'Doe', company: 'Google' },
      { firstName: 'Jane', lastName: 'Smith', company: 'Apple Inc.' },
      { firstName: 'Bob', lastName: 'Jones', company: 'Google' }, // Duplicate company
      { firstName: 'No', lastName: 'Company', company: '' },
    ];
    mockExtractor.extract.mockResolvedValue({ connections: mockConnections });
    vi.mocked(selectWithEscape).mockResolvedValue({ escaped: false, value: 'company_names' });
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await script.run();

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('companyNames.csv'),
      'Apple Inc, Google', // Sorted and unique
      'utf-8'
    );
  });

  it('should clean company names during export', async () => {
    const mockConnections = [
      { firstName: 'User', lastName: 'One', company: 'Company (Israel) Ltd.' },
    ];
    mockExtractor.extract.mockResolvedValue({ connections: mockConnections });
    vi.mocked(selectWithEscape).mockResolvedValue({ escaped: false, value: 'company_names' });

    await script.run();

    // "Company (Israel) Ltd." -> "Company Israel Ltd " -> "Company Israel Ltd"
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('companyNames.csv'),
      'Company Israel Ltd',
      'utf-8'
    );
  });
});
