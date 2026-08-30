/**
 * ChatbotInstructionBuilder — Domain types
 *
 * Draft-based instruction builder for chatbot advisors.
 * State round-trips via frontend and is persisted in bot metadata.
 */

import { DEFAULT_STRUCTURED_LOGIC } from '../chat/structured-logic';
import type { StructuredLogic } from '../chat/structured-logic';

export type InitialProcessJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type InitialProcessCheckpoint = {
  phase: 'map' | 'reduce' | 'final';
  tandaActual: number;
  totalTandas: number;
  progress: number;
  timestamp: string;
};

export type InitialProcessJob = {
  jobId: string;
  botId: string;
  sourceText: string;
  initialProcessJobStatus: InitialProcessJobStatus;
  tandaActual: number;
  totalTandas: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  checkpoints?: InitialProcessCheckpoint[];
  /** Explicit target mode for builder slot selection. Falls back to bot chatMode when absent. */
  targetMode?: 'full' | 'tasks-only';
  result?: {
    structuredLogic: unknown;
    chatMode?: 'full' | 'tasks-only';
    /** Validation summary for the generated draft (visible to the frontend). */
    validation?: {
      valid: boolean;
      errors: string[];
      qualityScore: number;
      qualityGaps: string[];
    };
  };
  error?: string;
};

export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

export type BuilderChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** ISO 8601 timestamp */
  timestamp?: string;
  /** Structured output from assistant (BUILD mode) */
  structuredOutput?: {
    structuredLogic: StructuredLogic;
  };
};

export type BuilderProcessingProgress = {
  currentChunk: number;
  totalChunks: number;
  builderProcessingProgressStatus: ProcessingStatus;
};

/** Snapshot of structured logic at a point in time */
export type BuilderSnapshot = {
  structuredLogic: StructuredLogic;
};

/** Single change entry in the builder history */
export type BuilderChange = {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** What triggered this change */
  type: 'chat' | 'manual-edit' | 'initial-process';
  /** Human-readable description of the change */
  description: string;
  /** State before the change */
  before: BuilderSnapshot;
  /** State after the change */
  after: BuilderSnapshot;
};

/** Draft state persisted in metadata.builderDraft */
export type BuilderDraft = {
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Draft structured logic (may differ from published) */
  structuredLogic: StructuredLogic;
  /** Change history (max 50 entries, FIFO) */
  history: BuilderChange[];
  /** Published version snapshot (for diff comparison) */
  published: BuilderSnapshot;
};

/**
 * The complete state of the builder session.
 * This is sent back and forth between frontend and backend.
 */
export type BuilderState = {
  botId: string;
  sourceText: string | null;
  /** Published structured logic (metadata.structuredLogic) */
  structuredLogic: StructuredLogic;
  /** Working draft (may have unsaved changes) */
  draft: BuilderDraft | null;
  /** Whether the draft differs from published */
  hasUnsavedChanges: boolean;
  chatHistory: BuilderChatMessage[];
  processingProgress: BuilderProcessingProgress;
  /** Active chat job ID (pending or processing), or null if no active job */
  activeChatJobId: string | null;
  /** Effective chat mode (full = LLM-driven, tasks-only = deterministic rules) */
  chatMode: 'full' | 'tasks-only';
};

/**
 * State for a single builder slot (tasks-only or full).
 */
export type BuilderSlotState = {
  /** Published structured logic for this slot */
  structuredLogic: StructuredLogic | null;
  /** Draft structured logic persisted by the builder for this slot */
  builderStructuredLogic: StructuredLogic | null;
  /** UI draft state for this slot */
  builderDraft: BuilderDraft | null;
  /** Whether the draft differs from published for this slot */
  hasDraftChanges: boolean;
};

/**
 * Dual state containing both slots (tasks-only and full).
 */
export type BuilderDualState = {
  /** Effective chat mode of the bot */
  chatMode: 'full' | 'tasks-only';
  /** State for the tasks-only slot */
  tasksOnly: BuilderSlotState;
  /** State for the full slot */
  full: BuilderSlotState;
};

/**
 * Default empty builder state.
 */
export function createDefaultBuilderState(
  botId: string,
  chatMode: BuilderState['chatMode'] = 'tasks-only',
): BuilderState {
  return {
    botId,
    sourceText: null,
    structuredLogic: DEFAULT_STRUCTURED_LOGIC,
    draft: null,
    hasUnsavedChanges: false,
    chatHistory: [],
    processingProgress: {
      currentChunk: 0,
      totalChunks: 0,
      builderProcessingProgressStatus: 'idle',
    },
    activeChatJobId: null,
    chatMode,
  };
}

/**
 * Create a draft from published values.
 * Used when no draft exists yet.
 */
export function createDraftFromPublished(
  published: BuilderSnapshot,
): BuilderDraft {
  return {
    updatedAt: new Date().toISOString(),
    structuredLogic: published.structuredLogic,
    history: [],
    published,
  };
}

/**
 * Check if draft has unsaved changes compared to published.
 */
export function hasDraftChanges(draft: BuilderDraft): boolean {
  // Simple JSON comparison for structuredLogic
  return JSON.stringify(draft.structuredLogic) !== JSON.stringify(draft.published.structuredLogic);
}

/**
 * Async chat job for background processing.
 * The LLM call is slow (3-30s) so we process it asynchronously
 * and the frontend polls for status.
 */
export type ChatJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ChatJob = {
  jobId: string;
  botId: string;
  chatJobStatus: ChatJobStatus;
  /** User message that triggered this job */
  message: string;
  mode: 'plan' | 'build' | 'auto';
  sourceTextVisible: boolean;
  /** Explicit target mode for builder slot selection. Falls back to bot chatMode when absent. */
  targetMode?: 'full' | 'tasks-only';
  /** structuredLogic snapshot at job creation time */
  structuredLogic?: StructuredLogic;
  /** Result when chatJobStatus === 'completed' */
  result?: {
    state: BuilderState;
    response: string;
    chatResponse?: {
      responseToUser: string;
      newStructuredLogic: StructuredLogic;
    };
  };
  /** Error when chatJobStatus === 'failed' */
  error?: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp */
  updatedAt: string;
};

/**
 * Maximum number of chat jobs to keep in metadata (FIFO).
 */
const MAX_CHAT_JOBS = 20;

/**
 * Add a chat job to the history, pruning old ones if needed.
 */
export function addChatJob(history: ChatJob[], job: ChatJob): ChatJob[] {
  const updated = [...history, job];
  if (updated.length > MAX_CHAT_JOBS) {
    return updated.slice(updated.length - MAX_CHAT_JOBS);
  }
  return updated;
}

/**
 * Maximum number of initial-process jobs to keep in metadata (FIFO).
 * Kept lower than chat jobs because each job stores the full sourceText.
 */
const MAX_INITIAL_PROCESS_JOBS = 5;

/**
 * Add an initial-process job to the history, pruning old ones if needed.
 * Older terminal jobs have their sourceText redacted to prevent metadata bloat.
 */
export function addInitialProcessJob(
  history: InitialProcessJob[],
  job: InitialProcessJob,
): InitialProcessJob[] {
  const updated = history.map((existing) => {
    // Redact sourceText from any job that is no longer pending/processing.
    // Only the active job retains the full sourceText.
    if (existing.initialProcessJobStatus === 'pending' || existing.initialProcessJobStatus === 'processing') {
      return existing;
    }
    return redactInitialProcessJobSourceText(existing);
  });
  updated.push(job);
  if (updated.length > MAX_INITIAL_PROCESS_JOBS) {
    return updated.slice(updated.length - MAX_INITIAL_PROCESS_JOBS);
  }
  return updated;
}

/**
 * Redact sourceText from a terminal initial-process job to avoid metadata bloat.
 * The sourceText is still available in builderSourceText while the bot is active.
 */
export function redactInitialProcessJobSourceText(job: InitialProcessJob): InitialProcessJob {
  return {
    ...job,
    sourceText: '',
  };
}
