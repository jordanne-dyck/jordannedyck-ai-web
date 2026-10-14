import { createHash } from 'crypto';
import { buildSystemPrompt } from './system-prompt';

// Short fingerprint of the system-prompt template, stored on every chat_events
// row so a quality change can be traced to a prompt edit. Hashes the template
// with an empty context: the built prompt changes with every retrieval, the
// template only when someone edits lib/system-prompt.ts.
export const PROMPT_VERSION = createHash('sha256')
  .update(buildSystemPrompt(''))
  .digest('hex')
  .slice(0, 8);
