/**
 * State Engine API — exposes lead state, events, triggers, and engine health.
 */

import { Router } from 'express';
import { query } from '../engine/db';
import { getPollerStatus } from '../engine/poller';

const router = Router();

// GET /api/engine/state/:contactId — single lead state
router.get('/state/:contactId', async (req, res) => {
  try {
    const result = await query('SELECT * FROM lead_state WHERE contact_id = $1', [req.params.contactId]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/engine/leads?stage=X&limit=50 — leads by stage or all
router.get('/leads', async (req, res) => {
  try {
    const stage = req.query.stage as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    let sql: string;
    let params: any[];

    if (stage) {
      sql = 'SELECT * FROM lead_state WHERE current_stage = $1 ORDER BY stage_entered_at DESC LIMIT $2';
      params = [stage, limit];
    } else {
      sql = 'SELECT * FROM lead_state ORDER BY updated_at DESC LIMIT $1';
      params = [limit];
    }

    const result = await query(sql, params);
    res.json({ count: result.rows.length, leads: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/engine/events/:contactId — event history for a contact
router.get('/events/:contactId', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const result = await query(
      'SELECT id, event_type, stage_id, pipeline_id, created_at FROM events WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.params.contactId, limit]
    );
    res.json({ count: result.rows.length, events: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/engine/triggers — recent trigger fires
router.get('/triggers', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const result = await query(
      'SELECT * FROM trigger_log ORDER BY fired_at DESC LIMIT $1',
      [limit]
    );
    res.json({ count: result.rows.length, triggers: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/engine/stats — engine health
router.get('/stats', async (req, res) => {
  try {
    const [events, leads, triggers, events24h, triggers24h] = await Promise.all([
      query('SELECT COUNT(*) as count FROM events'),
      query('SELECT COUNT(*) as count FROM lead_state'),
      query('SELECT COUNT(*) as count FROM trigger_log'),
      query("SELECT COUNT(*) as count FROM events WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(*) as count FROM trigger_log WHERE fired_at > NOW() - INTERVAL '24 hours'"),
    ]);

    const poller = getPollerStatus();

    res.json({
      totalEvents: Number(events.rows[0].count),
      totalLeads: Number(leads.rows[0].count),
      totalTriggersFired: Number(triggers.rows[0].count),
      eventsLast24h: Number(events24h.rows[0].count),
      triggersLast24h: Number(triggers24h.rows[0].count),
      pollerRunning: poller.running,
      lastPollerTick: poller.lastTickAt,
      dbConnected: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, dbConnected: false });
  }
});

export default router;
