export interface ScriptMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  category: 'interactive' | 'batch' | 'maintenance';
  requiresAuth: boolean;
  estimatedDuration?: string;
  emoji?: string;
}

export interface Script {
  metadata: ScriptMetadata;
  run: () => Promise<void>;
}

export interface MatchedContactInfo {
  resourceName: string;
  firstName: string;
  lastName: string;
  phones: string[];
}

export interface Stats {
  added: number;
  updated: number;
  skipped: number;
  error: number;
}
