// GSD event grouping utility — grouping logic separated from rendering (SRP)
// Merges Pre+Post tool event pairs into single GsdDisplayEvent entries.

import type { GsdRawEvent, GsdDisplayEvent } from '@shared/gsdTypes.js';
import { GSD_NOISE_EVENTS } from '@shared/gsdTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

function getToolInput(payload: Record<string, unknown>): Record<string, unknown> {
  return (payload.tool_input as Record<string, unknown>) ?? {};
}

interface AskQuestion {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect: boolean;
}

// Strip /home/forge/ prefix and show path relative to it
function toRelativePath(filePath: string): string {
  if (filePath.startsWith('/home/forge/')) {
    return filePath.slice('/home/forge/'.length);
  }
  return filePath;
}

function buildToolSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Read':
    case 'Write': {
      const filePath = String(toolInput.file_path ?? '');
      if (!filePath) return toolName;
      return truncate(toRelativePath(filePath), 80);
    }
    case 'Grep': {
      const pattern = String(toolInput.pattern ?? '');
      const path = toolInput.path ? String(toolInput.path) : '';
      if (!pattern) return 'Grep';
      return path ? `${truncate(pattern, 40)} in ${path}` : truncate(pattern, 60);
    }
    case 'Bash': {
      const description = String(toolInput.description ?? '').trim();
      if (description) return truncate(description, 80);
      const command = String(toolInput.command ?? '');
      return command ? truncate(command, 80) : 'Bash';
    }
    case 'Glob': {
      const pattern = String(toolInput.pattern ?? '');
      return pattern ? truncate(pattern, 60) : 'Glob';
    }
    case 'AskUserQuestion': {
      const questions = (toolInput.questions as AskQuestion[]) ?? [];
      if (questions.length > 0 && questions[0].question) {
        return truncate(questions[0].question, 60);
      }
      return 'AskUserQuestion';
    }
    case 'Skill': {
      const skill = String(toolInput.skill ?? '').trim();
      if (!skill) return 'Skill';
      const args = String(toolInput.args ?? '').trim();
      return truncate(args ? `${skill} ${args}` : skill, 80);
    }
    case 'Task': {
      const subagentType = String(toolInput.subagent_type ?? '').trim();
      const description = String(toolInput.description ?? '').trim();
      if (subagentType && description) return truncate(`${subagentType} — ${description}`, 80);
      if (description) return truncate(description, 80);
      if (subagentType) return truncate(subagentType, 80);
      return 'Task';
    }
    case 'Edit': {
      const filePath = String(toolInput.file_path ?? '');
      if (!filePath) return 'Edit';
      return truncate(toRelativePath(filePath), 80);
    }
    case 'TaskCreate': {
      const subject = String(toolInput.subject ?? '').trim();
      return subject ? truncate(subject, 80) : 'TaskCreate';
    }
    case 'TaskUpdate': {
      const taskId = String(toolInput.taskId ?? '').trim();
      const status = String(toolInput.status ?? '').trim();
      if (taskId && status) return `#${taskId} -> ${status}`;
      if (taskId) return `#${taskId}`;
      if (status) return `-> ${status}`;
      return 'TaskUpdate';
    }
    case 'TaskOutput': {
      const taskId = String(toolInput.task_id ?? '').trim();
      return taskId ? truncate(`task: ${taskId}`, 60) : 'TaskOutput';
    }
    default:
      return toolName;
  }
}

function buildToolDetail(
  toolName: string,
  toolInput: Record<string, unknown>,
): string | undefined {
  switch (toolName) {
    case 'Bash':
      return String(toolInput.command ?? '') || undefined;
    case 'Read':
    case 'Write':
      return String(toolInput.file_path ?? '') || undefined;
    case 'Grep': {
      const pattern = String(toolInput.pattern ?? '');
      const path = toolInput.path ? String(toolInput.path) : '';
      const glob = toolInput.glob ? String(toolInput.glob) : '';
      let detail = `pattern: ${pattern}`;
      if (path) detail += `\npath: ${path}`;
      if (glob) detail += `\nglob: ${glob}`;
      return detail || undefined;
    }
    case 'Glob': {
      const pattern = String(toolInput.pattern ?? '');
      const path = toolInput.path ? String(toolInput.path) : '';
      let detail = `pattern: ${pattern}`;
      if (path) detail += `\npath: ${path}`;
      return detail || undefined;
    }
    case 'AskUserQuestion':
      // AskUserQuestion detail is rendered by QuestionDisplay component
      return undefined;
    case 'Skill': {
      const skill = String(toolInput.skill ?? '').trim();
      const args = String(toolInput.args ?? '').trim();
      if (!skill) return undefined;
      return args ? `skill: ${skill}\nargs: ${args}` : `skill: ${skill}`;
    }
    case 'Task': {
      const subagentType = String(toolInput.subagent_type ?? '').trim();
      const model = String(toolInput.model ?? '').trim();
      const description = String(toolInput.description ?? '').trim();
      const parts: string[] = [];
      if (subagentType) parts.push(`subagent: ${subagentType}`);
      if (model) parts.push(`model: ${model}`);
      if (description) parts.push(`description: ${description}`);
      return parts.length > 0 ? parts.join('\n') : undefined;
    }
    case 'Edit':
      return String(toolInput.file_path ?? '') || undefined;
    case 'TaskCreate': {
      const subject = String(toolInput.subject ?? '').trim();
      const description = String(toolInput.description ?? '').trim();
      const parts: string[] = [];
      if (subject) parts.push(`subject: ${subject}`);
      if (description) parts.push(`description: ${truncate(description, 200)}`);
      return parts.length > 0 ? parts.join('\n') : undefined;
    }
    case 'TaskUpdate': {
      const taskId = String(toolInput.taskId ?? '').trim();
      const status = String(toolInput.status ?? '').trim();
      const parts: string[] = [];
      if (taskId) parts.push(`taskId: ${taskId}`);
      if (status) parts.push(`status: ${status}`);
      return parts.length > 0 ? parts.join('\n') : undefined;
    }
    case 'TaskOutput': {
      const taskId = String(toolInput.task_id ?? '').trim();
      return taskId ? `task_id: ${taskId}` : undefined;
    }
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function groupRawEvents(rawEvents: GsdRawEvent[]): GsdDisplayEvent[] {
  // Work on events in ascending order for correct Pre→Post pairing
  const ascending = [...rawEvents].reverse();

  // Map from tool_use_id to partially-built display event
  const toolMap = new Map<string, GsdDisplayEvent>();
  const orderedIds: string[] = [];
  const standaloneEvents: GsdDisplayEvent[] = [];

  for (const raw of ascending) {
    // Safety: skip noise events (already filtered server-side, belt-and-suspenders)
    if (GSD_NOISE_EVENTS.has(raw.event)) continue;

    const toolUseId = raw.payload.tool_use_id as string | undefined;
    const toolName = String(raw.payload.tool_name ?? '');
    const toolInput = getToolInput(raw.payload);

    if (raw.event === 'PreToolUse' && toolUseId) {
      if (toolName === 'AskUserQuestion') {
        const rawQuestions = (toolInput.questions as AskQuestion[]) ?? [];
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'ask_question',
          toolName,
          summary: buildToolSummary(toolName, toolInput),
          detail: undefined,
          questions: rawQuestions.map((q) => ({
            question: q.question,
            header: q.header,
            options: q.options ?? [],
            multiSelect: q.multiSelect ?? false,
            answer: undefined,
            notes: undefined,
          })),
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      } else {
        const summary = buildToolSummary(toolName, toolInput);
        const detail = buildToolDetail(toolName, toolInput);
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'tool',
          toolName,
          summary,
          detail,
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      }
    } else if (raw.event === 'PostToolUse' && toolUseId) {
      const existing = toolMap.get(toolUseId);
      if (existing && existing.eventType === 'ask_question') {
        // Merge answer data from PostToolUse into question entries
        const toolResponse = (raw.payload.tool_response as Record<string, unknown>) ?? {};
        const answers = (toolResponse.answers as Record<string, string>) ?? {};
        const annotations = (toolResponse.annotations as Record<string, { notes?: string }>) ?? {};
        const updated: GsdDisplayEvent = {
          ...existing,
          questions: existing.questions?.map((q) => ({
            ...q,
            answer: answers[q.question] ?? undefined,
            notes: annotations[q.question]?.notes ?? undefined,
          })),
        };
        toolMap.set(toolUseId, updated);
      }
      // For regular tools, the PreToolUse entry is sufficient — no update needed
    } else if (raw.event === 'PostToolUseFailure' && toolUseId) {
      const errorMessage = String(raw.payload.error ?? raw.payload.stderr ?? 'Unknown error');
      const existing = toolMap.get(toolUseId);
      if (existing) {
        toolMap.set(toolUseId, {
          ...existing,
          eventType: 'tool_failure',
          error: truncate(errorMessage, 120),
          detail: existing.detail
            ? `${existing.detail}\n\nError:\n${errorMessage}`
            : errorMessage,
        });
      } else {
        // PostToolUseFailure without matching Pre (outside read window) — standalone entry
        const entry: GsdDisplayEvent = {
          id: toolUseId,
          timestamp: raw.timestamp,
          session: raw.session,
          eventType: 'tool_failure',
          toolName: toolName || undefined,
          summary: toolName || 'Tool failure',
          error: truncate(errorMessage, 120),
          detail: errorMessage,
        };
        toolMap.set(toolUseId, entry);
        orderedIds.push(toolUseId);
      }
    } else {
      // Standalone event (no tool_use_id): lifecycle, prompts, etc.
      const id = `${raw.timestamp}-${raw.session}-${raw.event}`;
      let eventType: GsdDisplayEvent['eventType'] = 'lifecycle';
      let summary = '';
      let detail: string | undefined;

      switch (raw.event) {
        case 'UserPromptSubmit': {
          eventType = 'prompt';
          const prompt = String(raw.payload.prompt ?? '');
          summary = truncate(prompt, 200);
          detail = prompt || undefined;
          break;
        }
        case 'SessionStart': {
          const source = String(raw.payload.source ?? '');
          summary = source ? `Session started (${source})` : 'Session started';
          break;
        }
        case 'Stop':
          summary = 'Agent stopped';
          break;
        case 'SessionEnd': {
          const reason = String(raw.payload.reason ?? '');
          summary = reason ? `Session ended (${reason})` : 'Session ended';
          break;
        }
        case 'SubagentStart': {
          const agentType = String(raw.payload.agent_type ?? raw.payload.subagent_type ?? 'subagent');
          summary = `Subagent ${agentType} started`;
          break;
        }
        case 'SubagentStop': {
          const agentType = String(raw.payload.agent_type ?? raw.payload.subagent_type ?? 'subagent');
          summary = `Subagent ${agentType} stopped`;
          break;
        }
        default:
          summary = raw.event;
      }

      standaloneEvents.push({
        id,
        timestamp: raw.timestamp,
        session: raw.session,
        eventType,
        summary,
        detail,
      });
    }
  }

  // Combine tool events (in ascending order) with standalone events, then reverse to newest-first
  const toolEvents: GsdDisplayEvent[] = [];
  for (const id of orderedIds) {
    const entry = toolMap.get(id);
    if (entry) toolEvents.push(entry);
  }

  const allEvents = [...toolEvents, ...standaloneEvents];
  // Sort by timestamp descending (newest first)
  allEvents.sort((a, b) => {
    if (a.timestamp > b.timestamp) return -1;
    if (a.timestamp < b.timestamp) return 1;
    return 0;
  });

  return allEvents;
}
