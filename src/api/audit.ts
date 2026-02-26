/**
 * Audit API — read-only view of what agents have done.
 * GET /api/audit            → recent log entries
 * GET /api/audit/:contactId → log for a specific contact
 * POST /api/audit/force     → force-run pipeline for a lead
 */

import { Router } from 'express';
import { getAuditLog, getAuditForContact } from '../core/audit';
import { forceSync } from '../core/crm-sync';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getAuditLog(500));
});

router.get('/:contactId', (req, res) => {
  res.json(getAuditForContact(req.params.contactId));
});

router.post('/force', async (req, res) => {
  const { contactId, opportunityId } = req.body;
  try {
    await forceSync(contactId, opportunityId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
