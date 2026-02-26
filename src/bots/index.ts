/**
 * Bots — the ONLY layer allowed to write to GHL.
 * Each bot does exactly one thing.
 * All bots check isDryRun() before writing.
 */

export { contactBot } from './contact';
export { scorerBot } from './scorer';
export { stageBot } from './stage';
export { taskBot } from './task';
export { noteBot } from './note';
export { tagBot } from './tag';
export { fieldBot } from './field';
export { smsBot } from './sms';
export { assignBot } from './assign';
