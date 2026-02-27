/**
 * Config Module — barrel export
 *
 * Usage in agents:
 *   import { loadPlaybook, getStageId, getTag, renderTemplate } from '../config';
 */

export { loadPlaybook, clearPlaybookCache } from './loader';
export {
  // Stages & Pipelines
  getStageId,
  getPipelineId,

  // Custom Fields
  getFieldName,
  getFieldNames,

  // Tags
  getTag,

  // Tasks
  getTaskTemplate,
  renderTemplate,

  // Notes
  getNoteTemplate,

  // Team
  getTeamMember,
  getLmIds,
  getAmIds,
  getDefaultAssignee,
  getEscalationUser,

  // SLAs
  getSla,

  // Drip
  getDripSchedule,

  // Communication
  getSendWindow,

  // AI
  getAiPrompt,
  getAiConfig,

  // Triggers
  getTriggersForStage,
  getTriggersForEvent,

  // Follow-Up
  getFollowUpBucket,
  getFollowUpTones,
} from './helpers';
