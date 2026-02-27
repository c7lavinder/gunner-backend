/**
 * Research Engine — proactively analyzes patterns and generates insights.
 */

import { getRecentByCategory, getStats, getAllCategories } from './memory';

export interface PatternReport {
  bestSendTimes: Array<{ hour: number; responseRate: number }>;
  bestTones: Array<{ tone: string; responseRate: number }>;
  bestDays: Array<{ day: string; responseRate: number }>;
  insights: string[];
}

export interface TeamReport {
  memberStats: Array<{
    name: string;
    avgResponseTime: number;
    conversionRate: number;
    strengths: string[];
    improvements: string[];
  }>;
  insights: string[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function analyzePatterns(_tenantId: string): Promise<PatternReport> {
  const entries = await getRecentByCategory('sms-performance', 200);

  // Analyze by hour
  const hourMap: Record<number, { sent: number; replied: number }> = {};
  const toneMap: Record<string, { sent: number; replied: number }> = {};
  const dayMap: Record<string, { sent: number; replied: number }> = {};

  for (const e of entries) {
    const sentAt = e.output.sentAt ?? e.createdAt;
    const d = new Date(sentAt);
    const hour = d.getHours();
    const day = DAYS[d.getDay()];
    const tone = (e.input.tone as string) ?? 'unknown';
    const gotReply = e.outcome?.replied === true || (e.score ?? 0) > 60;

    if (!hourMap[hour]) hourMap[hour] = { sent: 0, replied: 0 };
    hourMap[hour].sent++;
    if (gotReply) hourMap[hour].replied++;

    if (!toneMap[tone]) toneMap[tone] = { sent: 0, replied: 0 };
    toneMap[tone].sent++;
    if (gotReply) toneMap[tone].replied++;

    if (!dayMap[day]) dayMap[day] = { sent: 0, replied: 0 };
    dayMap[day].sent++;
    if (gotReply) dayMap[day].replied++;
  }

  const bestSendTimes = Object.entries(hourMap)
    .map(([h, v]) => ({ hour: Number(h), responseRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0 }))
    .sort((a, b) => b.responseRate - a.responseRate)
    .slice(0, 5);

  const bestTones = Object.entries(toneMap)
    .filter(([, v]) => v.sent >= 3)
    .map(([tone, v]) => ({ tone, responseRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0 }))
    .sort((a, b) => b.responseRate - a.responseRate);

  const bestDays = Object.entries(dayMap)
    .map(([day, v]) => ({ day, responseRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0 }))
    .sort((a, b) => b.responseRate - a.responseRate);

  const insights: string[] = [];
  if (bestSendTimes.length > 0) {
    insights.push(`Best send time: ${bestSendTimes[0].hour}:00 with ${bestSendTimes[0].responseRate}% response rate`);
  }
  if (bestTones.length > 0) {
    insights.push(`Best tone: "${bestTones[0].tone}" with ${bestTones[0].responseRate}% response rate`);
  }
  if (bestDays.length > 0) {
    insights.push(`Best day: ${bestDays[0].day} with ${bestDays[0].responseRate}% response rate`);
  }

  return { bestSendTimes, bestTones, bestDays, insights };
}

export async function analyzeTeamPatterns(_tenantId: string): Promise<TeamReport> {
  const entries = await getRecentByCategory('coaching-patterns', 200);

  const memberMap: Record<string, { scores: number[]; calls: number }> = {};
  for (const e of entries) {
    const name = (e.input.teamMember as string) ?? 'unknown';
    if (!memberMap[name]) memberMap[name] = { scores: [], calls: 0 };
    memberMap[name].calls++;
    if (e.score !== null) memberMap[name].scores.push(e.score);
  }

  const memberStats = Object.entries(memberMap).map(([name, data]) => {
    const avg = data.scores.length > 0
      ? data.scores.reduce((s, v) => s + v, 0) / data.scores.length
      : 0;
    return {
      name,
      avgResponseTime: 0,
      conversionRate: Math.round(avg),
      strengths: avg > 70 ? ['Consistent performer'] : [],
      improvements: avg < 50 ? ['Needs coaching attention'] : [],
    };
  });

  return {
    memberStats,
    insights: memberStats.length > 0
      ? [`Analyzed ${entries.length} coaching entries across ${memberStats.length} team members`]
      : ['No coaching data yet'],
  };
}

export async function generateBriefing(_tenantId: string): Promise<string> {
  const categories = await getAllCategories();
  const sections: string[] = ['# Daily Intelligence Briefing', ''];

  for (const cat of categories) {
    const stats = await getStats(cat);
    if (stats.total === 0) continue;
    sections.push(`## ${cat}`);
    sections.push(`- Total entries: ${stats.total}`);
    sections.push(`- Avg score: ${stats.avgScore}/100`);
    sections.push(`- Improving: ${stats.improvedOverTime ? '✅ Yes' : '⏸️ Not yet'}`);
    sections.push('');
  }

  if (sections.length <= 2) {
    sections.push('No intelligence data collected yet. The system will start learning as agents take actions.');
  }

  return sections.join('\n');
}
