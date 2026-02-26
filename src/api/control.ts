/**
 * Control API — toggle agents/bots on and off.
 * GET  /api/control/state   → all toggles + dry run flag
 * POST /api/control/toggle  → { id, enabled } → flip a toggle
 */

import { Router } from 'express';
import { getAllToggles, setToggle } from '../core/toggles';
import { isDryRun } from '../core/dry-run';

const router = Router();

router.get('/state', (_req, res) => {
  res.json({
    dryRun: isDryRun(),
    toggles: getAllToggles(),
  });
});

router.post('/toggle', (req, res) => {
  const { id, enabled } = req.body;
  if (typeof id !== 'string' || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'id (string) and enabled (boolean) required' });
  }
  const ok = setToggle(id, enabled);
  if (!ok) return res.status(404).json({ error: `Toggle not found: ${id}` });
  res.json({ ok: true, id, enabled });
});

export default router;
