/**
 * Dry run flag — checked at the bot layer before any write to GHL.
 * Agents never check this. Only bots do.
 */

export function isDryRun(): boolean {
  return process.env.DRY_RUN === 'true';
}
