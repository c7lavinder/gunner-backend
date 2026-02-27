/**
 * Morning Briefing Agent — runs daily at 8:00 AM CST.
 * Gathers 24h stats from audit log, generates a Telegram-ready briefing.
 * Toggle: morning-briefing
 *
 * NO logic here — only calls bots.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { auditLog, getAuditLog, AuditEntry } from '../core/audit';
import { briefingWriterBot } from '../bots/briefing-writer';
import { aiWriterBot } from '../bots/ai-writer';

const AGENT_ID = 'morning-briefing';
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** In-memory store for the latest briefing */
export interface MorningBriefing {
  date: string;
  text: string;
  telegram: string;
  stats: BriefingStats;
  generatedAt: number;
  isDryRun: boolean;
}

export interface BriefingStats {
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  appointmentsSet: number;
  offersMade: number;
  contractsSigned: number;
  agentFires: Record<string, number>;
  totalAgentFires: number;
  errorCount: number;
  topPerformer: { name: string; actions: number } | null;
}

let latestBriefing: MorningBriefing | null = null;

export function getLatestBriefing(): MorningBriefing | null {
  return latestBriefing;
}

function gatherStats(): BriefingStats {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const entries = getAuditLog(5000).filter((e) => e.timestamp >= oneDayAgo);

  const newLeads = entries.filter((e) => e.action === 'new-lead-pipeline:ingest' || e.agent === 'new-lead-pipeline').length;

  // Score tiers from scorer entries
  let hotLeads = 0;
  let warmLeads = 0;
  let coldLeads = 0;
  for (const e of entries) {
    if (e.agent === 'lead-scorer' || e.action.includes('score')) {
      const reason = (e.reason ?? '').toLowerCase();
      if (reason.includes('hot')) hotLeads++;
      else if (reason.includes('warm')) warmLeads++;
      else if (reason.includes('cold')) coldLeads++;
    }
  }

  const appointmentsSet = entries.filter(
    (e) => e.action.includes('appointment') || e.action.includes('apt') || e.agent === 'apt-prep'
  ).length;

  const offersMade = entries.filter(
    (e) => e.action.includes('offer') || e.agent === 'offer-chase' || e.agent === 'offer-reply'
  ).length;

  const contractsSigned = entries.filter(
    (e) => e.action.includes('contract') || e.agent === 'contract-bot'
  ).length;

  // Agent fire counts
  const agentFires: Record<string, number> = {};
  for (const e of entries) {
    agentFires[e.agent] = (agentFires[e.agent] ?? 0) + 1;
  }
  const totalAgentFires = entries.length;

  const errorCount = entries.filter((e) => e.result === 'error').length;

  // Top performer — agent with most fires (excluding system agents)
  const systemAgents = new Set(['intelligence-poller', 'intelligence-researcher', 'intelligence-feedback', 'morning-briefing']);
  let topPerformer: { name: string; actions: number } | null = null;
  for (const [agent, count] of Object.entries(agentFires)) {
    if (systemAgents.has(agent)) continue;
    if (!topPerformer || count > topPerformer.actions) {
      topPerformer = { name: agent, actions: count };
    }
  }

  return {
    newLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    appointmentsSet,
    offersMade,
    contractsSigned,
    agentFires,
    totalAgentFires,
    errorCount,
    topPerformer,
  };
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}

function buildTelegramBriefing(stats: BriefingStats, aiInsight: string, dryRun: boolean): string {
  const date = formatDate();
  const dryRunNote = dryRun ? '\n⚠️ _Simulated data — DRY RUN mode_\n' : '';

  const topLine = stats.topPerformer
    ? `🏆 Top Performer: ${stats.topPerformer.name} (${stats.topPerformer.actions} actions)`
    : '🏆 Top Performer: No activity yet';

  const systemStatus = stats.errorCount === 0 ? 'All systems green ✅' : `⚠️ ${stats.errorCount} error(s) detected`;

  return `🌅 Morning Briefing — ${date}
${dryRunNote}
📊 Yesterday's Numbers:
• ${stats.newLeads} new leads (${stats.hotLeads} Hot, ${stats.warmLeads} Warm, ${stats.coldLeads} Cold)
• ${stats.appointmentsSet} appointment(s) set
• ${stats.offersMade} offer(s) made
• ${stats.contractsSigned} contract(s)

${topLine}
⚡ System: ${stats.totalAgentFires} agent fires, ${stats.errorCount} errors

${aiInsight ? `🧠 ${aiInsight}\n\n` : ''}${systemStatus}`;
}

export async function runMorningBriefing(): Promise<MorningBriefing | null> {
  if (!isEnabled(AGENT_ID)) return null;

  const start = Date.now();
  console.log('[morning-briefing] generating daily briefing');

  try {
    const dryRun = isDryRun();
    const stats = gatherStats();

    // Use briefing-writer bot to get base briefing
    const baseBriefing = await briefingWriterBot.writeBriefing('default').catch((err) => {
      console.error('[morning-briefing] briefingWriterBot failed:', (err as Error).message);
      return '';
    });

    // Use AI writer bot to generate a conversational insight
    const aiInsight = await aiWriterBot
      .writeText(
        `Given these daily stats for a real estate wholesaling operation: ${stats.newLeads} new leads, ${stats.hotLeads} hot, ${stats.warmLeads} warm, ${stats.coldLeads} cold, ${stats.appointmentsSet} appointments, ${stats.offersMade} offers, ${stats.contractsSigned} contracts, ${stats.totalAgentFires} agent fires, ${stats.errorCount} errors. Give ONE short actionable insight (under 20 words).`,
        'You are a real estate wholesaling operations analyst. Be concise and actionable.',
        'coaching-patterns'
      )
      .catch((err) => {
        console.error('[morning-briefing] aiWriterBot failed:', (err as Error).message);
        return '';
      });

    const telegram = buildTelegramBriefing(stats, aiInsight, dryRun);

    latestBriefing = {
      date: formatDate(),
      text: baseBriefing || telegram,
      telegram,
      stats,
      generatedAt: Date.now(),
      isDryRun: dryRun,
    };

    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'morning-briefing:generated',
      result: 'success',
      reason: `leads=${stats.newLeads} fires=${stats.totalAgentFires} errors=${stats.errorCount}`,
      durationMs: Date.now() - start,
    });

    console.log('[morning-briefing] briefing generated successfully');
    return latestBriefing;
  } catch (err) {
    console.error('[morning-briefing] failed:', (err as Error).message);
    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'morning-briefing:generated',
      result: 'error',
      reason: (err as Error).message,
      durationMs: Date.now() - start,
    });
    return null;
  }
}

/** Check if it's 8:00 AM CST (within a 1-minute window) */
function isEightAmCst(): boolean {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return cst.getHours() === 8 && cst.getMinutes() === 0;
}

const ONE_MINUTE = 60 * 1000;

export function startMorningBriefing(): void {
  // Check every minute if it's 8:00 AM CST
  intervalHandle = setInterval(() => {
    if (isEightAmCst()) {
      void runMorningBriefing();
    }
  }, ONE_MINUTE);
  console.log('[morning-briefing] scheduled (daily at 8:00 AM CST)');
}

export function stopMorningBriefing(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
