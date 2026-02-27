/**
 * Bots — the ONLY layer allowed to talk to integrations.
 * Each bot does exactly one thing.
 * All write bots check isDryRun() before writing.
 */

// === WRITE BOTS ===
export { contactBot } from './contact';
export { scorerBot } from './scorer';
export { stageBot } from './stage';
export { taskBot } from './task';
export { noteBot } from './note';
export { tagBot } from './tag';
export { fieldBot } from './field';
export { smsBot } from './sms';
export { assignBot } from './assign';

// === READ BOTS ===
export { searchBot } from './contact-search';
export { taskReaderBot } from './task-reader';
export { noteReaderBot } from './note-reader';
export { opportunityBot } from './opportunity';
export { pipelineReaderBot } from './pipeline-reader';

// === AI BOTS ===
export { aiWriterBot } from './ai-writer';
export { aiClassifierBot } from './ai-classifier';

// === COMMUNICATION BOTS ===
export { emailBot } from './email';

// === INTELLIGENCE ===
export { memoryWriterBot } from './memory-writer';
export { memoryReaderBot } from './memory-reader';
export { outcomeTrackerBot } from './outcome-tracker';
export { learningBuilderBot } from './learning-builder';
export { patternAnalyzerBot } from './pattern-analyzer';
export { briefingWriterBot } from './briefing-writer';
export { feedbackWriterBot } from './feedback-writer';

// === LOGIC BOTS ===
export { classifierBot } from './classifier';
export { templateBot } from './template';
export { schedulerBot } from './scheduler';
export { guardBot } from './guard';
export { complianceBot } from './compliance';
