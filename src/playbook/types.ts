/**
 * Playbook — industry-agnostic definition of how Gunner
 * scores, stages, and processes leads for a given vertical.
 */

export interface ScoringFactor {
  /** Display name, e.g. "Timeline" */
  name: string;
  /** Instruction given to the AI for evaluating this factor */
  prompt: string;
  /** Optional keywords for the rule-based fallback scorer */
  fallbackKeywords?: string[];
}

export interface Playbook {
  /** Human-readable industry label */
  industry: string;

  /** How leads are scored */
  scoring: {
    factors: ScoringFactor[];
  };

  /** Maps logical stage keys → CRM stage IDs (loaded from env/config) */
  stages: Record<string, string>;
}
