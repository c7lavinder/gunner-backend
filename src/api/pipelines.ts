/**
 * Pipeline Discovery Routes — auto-discover GHL pipelines for tenant onboarding.
 */

import { Router } from 'express';
import { ghlGet, getLocationId } from '../integrations/ghl/client';

const router = Router();

interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

// GET /setup/pipelines — discover all pipelines + stages from GHL
router.get('/', async (_req, res) => {
  try {
    const locationId = getLocationId();
    const data = await ghlGet<{ pipelines: Pipeline[] }>(
      '/opportunities/pipelines',
      { locationId },
    );

    res.json({
      success: true,
      locationId,
      count: data.pipelines.length,
      pipelines: data.pipelines.map(p => ({
        id: p.id,
        name: p.name,
        stageCount: p.stages.length,
        stages: p.stages.map(s => ({
          id: s.id,
          name: s.name,
          position: s.position,
        })),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
