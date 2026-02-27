/**
 * Briefing API — morning briefing endpoints.
 *
 * GET /api/briefing/latest   — latest briefing as JSON
 * GET /api/briefing/telegram — latest briefing formatted for Telegram markdown
 */

import { Router } from 'express';
import { getLatestBriefing, runMorningBriefing } from '../agents/morning-briefing';

const router = Router();

router.get('/latest', async (_req, res) => {
  try {
    let briefing = getLatestBriefing();
    if (!briefing) {
      // Generate on-demand if none exists yet
      briefing = await runMorningBriefing();
    }
    if (!briefing) {
      return res.status(404).json({ error: 'No briefing available. Agent may be disabled.' });
    }
    res.json({ briefing });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/telegram', async (_req, res) => {
  try {
    let briefing = getLatestBriefing();
    if (!briefing) {
      briefing = await runMorningBriefing();
    }
    if (!briefing) {
      return res.status(404).json({ error: 'No briefing available. Agent may be disabled.' });
    }
    res.type('text/plain').send(briefing.telegram);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
