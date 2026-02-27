/**
 * Default Playbook — Wholesale Real Estate
 * This is the "New Again Houses" configuration.
 */

import type { Playbook } from './types';
import { getConfig } from './config';

export function buildDefaultPlaybook(): Playbook {
  const cfg = getConfig();

  return {
    industry: 'Wholesale Real Estate',

    scoring: {
      factors: [
        {
          name: 'Timeline',
          prompt: 'Does the seller need to sell quickly (within 90 days)? Look for urgency cues.',
          fallbackKeywords: ['asap', 'urgent', '90 day', '60 day', '30 day'],
        },
        {
          name: 'Motivation',
          prompt: 'Is there a distress signal (divorce, foreclosure, inheritance, behind on payments, tax lien)?',
          fallbackKeywords: ['divorce', 'foreclosure', 'inherit', 'behind', 'tax lien', 'probate'],
        },
        {
          name: 'Condition',
          prompt: 'Does the property need significant repairs or updating?',
          fallbackKeywords: ['repair', 'fix', 'damage', 'update', 'roof', 'foundation'],
        },
        {
          name: 'Price',
          prompt: 'Is the asking price likely below market value, or is the seller flexible on price?',
          fallbackKeywords: [],
        },
        {
          name: 'Source',
          prompt: 'Did this lead come from a high-intent source (PPL, inbound call, driving for dollars)?',
          fallbackKeywords: [],
        },
      ],
    },

    stages: cfg.stages,
  };
}
