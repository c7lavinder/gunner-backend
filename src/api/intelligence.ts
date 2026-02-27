/**
 * Intelligence API — feedback, briefing, stats.
 * POST /api/intelligence/feedback — { actionId, feedback, score }
 * GET  /api/intelligence/briefing  — latest briefing
 * GET  /api/intelligence/stats     — learning stats by category
 */

import { Router } from 'express';
import { intelligenceBot } from '../bots/intelligence';
import { getStats, getAllCategories, getById } from '../intelligence/memory';
import { analyzePatterns, PatternReport } from '../intelligence/researcher';

const router = Router();

router.post('/feedback', async (req, res) => {
  const { actionId, feedback, score } = req.body;
  if (!actionId || typeof actionId !== 'string') {
    return res.status(400).json({ error: 'actionId (string) required' });
  }
  if (!feedback && score === undefined) {
    return res.status(400).json({ error: 'feedback (string) or score (number) required' });
  }
  try {
    await intelligenceBot.recordFeedback(actionId, feedback ?? '', score);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/briefing', async (_req, res) => {
  try {
    const tenantId = (_req.query.tenantId as string) ?? 'default';
    const briefing = await intelligenceBot.getBriefing(tenantId);
    res.json({ briefing });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/stats', async (_req, res) => {
  try {
    const categories = await getAllCategories();
    const stats: Record<string, { total: number; avgScore: number; improvedOverTime: boolean }> = {};
    for (const cat of categories) {
      stats[cat] = await getStats(cat);
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/patterns', async (_req, res) => {
  try {
    const tenantId = (_req.query.tenantId as string) ?? 'default';
    const patterns: PatternReport = await analyzePatterns(tenantId);
    res.json({ patterns });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/entry/:id', async (req, res) => {
  try {
    const entry = await getById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
