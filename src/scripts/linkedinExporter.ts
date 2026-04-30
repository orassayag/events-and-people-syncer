import { injectable, inject } from 'inversify';
import path from 'path';
import { promises as fs } from 'fs';
import type { Script } from '../types';
import type { LinkedInConnection } from '../types';
import { selectWithEscape } from '../utils';
import { LinkedInExtractor } from '../services/linkedin';
import { Logger } from '../logging';
import { EMOJIS } from '../constants';

@injectable()
export class LinkedInExporterScript {
  private uiLogger: Logger = new Logger('LinkedInExporter');

  constructor(
    @inject(LinkedInExtractor) private extractor: LinkedInExtractor
  ) {}

  async run(): Promise<void> {
    this.uiLogger.display('Starting LinkedIn Exporter');
    this.uiLogger.display('Extracting LinkedIn connections from ZIP...');

    let connections: LinkedInConnection[];
    try {
      const result = await this.extractor.extract();
      connections = result.connections;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.uiLogger.displayError(
        `Failed to extract connections: ${errorMessage}`
      );
      return;
    }

    this.uiLogger.displaySuccess(
      `Found ${connections.length} connections. Validation complete.`
    );

    const result = await selectWithEscape<string>({
      message: 'Select what to export:',
      loop: false,
      choices: [
        {
          name: '🏢 Company names',
          value: 'company_names',
        },
      ],
    });

    if (result.escaped) {
      this.uiLogger.displayWarning('Export cancelled.');
      return;
    }

    if (result.value === 'company_names') {
      const companyNames = new Set<string>();
      for (const conn of connections) {
        if (conn.company && conn.company.trim() !== '') {
          // Replace special characters (anything not English letter, number, or whitespace) with space
          // and then collapse multiple spaces into one, finally trimming.
          const cleanedName = conn.company
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (cleanedName) {
            companyNames.add(cleanedName);
          }
        }
      }

      const sortedCompanies = Array.from(companyNames).sort((a, b) =>
        a.localeCompare(b)
      );
      const exportString = sortedCompanies.join(', ');

      const distDir = path.join(process.cwd(), 'dist');
      await fs.mkdir(distDir, { recursive: true });
      const outPath = path.join(distDir, 'companyNames.csv');

      await fs.writeFile(outPath, exportString, 'utf-8');
      this.uiLogger.displaySuccess(
        `Exported ${sortedCompanies.length} distinct company names to ${outPath}`
      );
    }
  }
}

export const linkedInExporterScript: Script = {
  metadata: {
    name: 'LinkedIn Exporter',
    description: 'Export specific data parts from backup file to CSV',
    version: '1.0.0',
    category: 'batch',
    requiresAuth: false,
    estimatedDuration: '1 minute',
    emoji: EMOJIS.SCRIPTS.LINKEDIN,
  },
  run: async () => {
    const { container } = await import('../di/container');
    const script = container.get(LinkedInExporterScript);
    await script.run();
  },
};
