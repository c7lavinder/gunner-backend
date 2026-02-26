/**
 * Config — all tenant-specific values live here.
 * Nothing hardcoded anywhere else. Ever.
 * Stage IDs, pipeline IDs, user IDs, SLAs — all from env or this file.
 */

export interface PlaybookConfig {
  tenantId: string;
  locationId: string;
  pipelines: Record<string, string>;
  stages: Record<string, string>;
  team: {
    defaultLM: string;
    defaultAM: string;
  };
  sla: {
    initialCallMinutes: number;
  };
  sendWindow: {
    startHour: number; // local time
    endHour: number;
  };
}

let _config: PlaybookConfig | null = null;

export function loadConfig(): PlaybookConfig {
  _config = {
    tenantId: process.env.TENANT_ID ?? 'default',
    locationId: process.env.GHL_LOCATION_ID ?? '',
    pipelines: {
      salesProcess: process.env.PIPELINE_SALES_ID ?? '',
      followUp: process.env.PIPELINE_FOLLOW_UP_ID ?? '',
    },
    stages: {
      newLead:       process.env.STAGE_NEW_LEAD ?? '',
      warm:          process.env.STAGE_WARM ?? '',
      hot:           process.env.STAGE_HOT ?? '',
      appointment:   process.env.STAGE_APPOINTMENT ?? '',
      offer:         process.env.STAGE_OFFER ?? '',
      underContract: process.env.STAGE_UNDER_CONTRACT ?? '',
      purchased:     process.env.STAGE_PURCHASED ?? '',
      ghosted:       process.env.STAGE_GHOSTED ?? '',
      notAFit:       process.env.STAGE_NOT_A_FIT ?? '',
      oneMonthFU:    process.env.STAGE_1MO_FU ?? '',
      fourMonthFU:   process.env.STAGE_4MO_FU ?? '',
      oneYearFU:     process.env.STAGE_1YR_FU ?? '',
    },
    team: {
      defaultLM: process.env.DEFAULT_LM_USER_ID ?? '',
      defaultAM: process.env.DEFAULT_AM_USER_ID ?? '',
    },
    sla: {
      initialCallMinutes: Number(process.env.SLA_INITIAL_CALL_MINUTES ?? 30),
    },
    sendWindow: {
      startHour: Number(process.env.SEND_WINDOW_START ?? 9),
      endHour:   Number(process.env.SEND_WINDOW_END ?? 18),
    },
  };
  return _config;
}

export function getConfig(): PlaybookConfig {
  if (!_config) throw new Error('Config not loaded — call loadConfig() first');
  return _config;
}

// Helpers
export function stageId(name: string): string {
  const id = getConfig().stages[name];
  if (!id) throw new Error(`Unknown stage: ${name}`);
  return id;
}

export function pipelineId(name: string): string {
  const id = getConfig().pipelines[name];
  if (!id) throw new Error(`Unknown pipeline: ${name}`);
  return id;
}
