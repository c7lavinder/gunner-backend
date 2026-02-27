/**
 * Reality Check — Shared types
 */

export interface SystemIssue {
  contactId: string;
  issueType:
    | 'no-score-assigned'
    | 'no-initial-outreach'
    | 'pipeline-stalled'
    | 'duplicate-tasks'
    | 'missing-stage-note-or-tag';
  details: string;
  detectedAt: number;
}

export interface TeamIssue {
  contactId: string;
  assignee: string;
  issueType:
    | 'warm-no-call'
    | 'appointment-no-walkthrough-notes'
    | 'dead-zero-outreach'
    | 'slow-response-time'
    | 'overdue-tasks';
  details: string;
  detectedAt: number;
}

export interface RealityCheckReport {
  systemIssues: SystemIssue[];
  teamIssues: TeamIssue[];
  stats: {
    leadsChecked: number;
    systemIssuesFound: number;
    teamIssuesFound: number;
  };
  auditWindowStart: number;
  auditWindowEnd: number;
  timestamp: number;
}
