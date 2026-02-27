/**
 * Reality Check — Report Generation & Formatting
 *
 * One job: turn raw audit data into structured reports and human-readable text.
 */

import type { RealityCheckReport } from './types';

/**
 * Format the structured report into a plain-English summary.
 */
export function formatReportText(report: RealityCheckReport): string {
  const lines: string[] = [];
  const windowMins = Math.round(
    (report.auditWindowEnd - report.auditWindowStart) / 60_000,
  );
  const windowHours = Math.round((windowMins / 60) * 10) / 10;

  lines.push(`Reality Check Report`);
  lines.push(`Window: last ${windowHours} hours`);
  lines.push(`Leads checked: ${report.stats.leadsChecked}`);
  lines.push('');

  // System issues
  if (report.systemIssues.length === 0) {
    lines.push(`No system issues — all automations appear healthy.`);
  } else {
    lines.push(
      `${report.systemIssues.length} system issue(s) found:`,
    );
    for (const issue of report.systemIssues) {
      lines.push(
        `  - [${issue.issueType}] ${issue.details} (contact: ${issue.contactId})`,
      );
    }
  }

  lines.push('');

  // Team issues
  if (report.teamIssues.length === 0) {
    lines.push(`No team issues — everyone's following the playbook.`);
  } else {
    lines.push(
      `${report.teamIssues.length} team issue(s) found:`,
    );
    for (const issue of report.teamIssues) {
      lines.push(
        `  - [${issue.issueType}] ${issue.details} (${issue.assignee}, contact: ${issue.contactId})`,
      );
    }
  }

  lines.push('');
  lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);

  return lines.join('\n');
}
