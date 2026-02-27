/**
 * Intelligence API — feedback, briefing, stats, patterns.
 *
 * POST /api/intelligence/feedback — { actionId, feedback, score }
 * GET  /api/intelligence/briefing  — latest briefing
 * GET  /api/intelligence/stats     — learning stats by category
 * GET  /api/intelligence/patterns  — SMS pattern analysis
 * GET  /api/intelligence/entry/:id — single entry lookup
 */

import { Router } from 'express';
import { runIntelligenceFeedback } from '../agents/intelligence-feedback';
import { memoryReaderBot } from '../bots/memory-reader';
import { briefingWriterBot } from '../bots/briefing-writer';
import { patternAnalyzerBot } from '../bots/pattern-analyzer';
import { getById, getAllCategories } from '../intelligence/memory';

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
    await runIntelligenceFeedback(actionId, feedback ?? '', score);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/briefing', async (req, res) => {
  try {
    const tenantId = (req.query.tenantId as string) ?? 'default';
    const briefing = await briefingWriterBot.writeBriefing(tenantId);
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
      stats[cat] = await memoryReaderBot.getStats(cat);
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/patterns', async (req, res) => {
  try {
    const tenantId = (req.query.tenantId as string) ?? 'default';
    const patterns = await patternAnalyzerBot.analyzeResponseRates(tenantId);
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
