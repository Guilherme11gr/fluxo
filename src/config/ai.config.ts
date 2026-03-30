/**
 * AI Configuration
 * 
 * Centralized configuration for AI-related operations.
 * All values have sensible defaults but can be overridden via environment variables.
 */

// ===========================================
// TIMEOUTS (milliseconds)
// ===========================================

/** Timeout for simple text refinement (DeepSeek Chat - fast) */
export const AI_REFINE_TIMEOUT_MS = parseInt(
    process.env.NEXT_PUBLIC_AI_REFINE_TIMEOUT_MS || '30000',
    10
);

/** Timeout for complex generation (DeepSeek Reasoner - slower) */
export const AI_GENERATE_TIMEOUT_MS = parseInt(
    process.env.NEXT_PUBLIC_AI_GENERATE_TIMEOUT_MS || '45000',
    10
);

/** Server-side timeout (should be slightly less than client to return proper error) */
export const AI_SERVER_TIMEOUT_MS = parseInt(
    process.env.AI_SERVER_TIMEOUT_MS || '40000',
    10
);

/** Cooldown between consecutive AI calls (prevents spam) */
export const AI_COOLDOWN_MS = parseInt(
    process.env.NEXT_PUBLIC_AI_COOLDOWN_MS || '2000',
    10
);

// ===========================================
// CONTEXT FILTERING
// ===========================================

/** Maximum docs to include in AI context (lower = cheaper, faster) */
export const AI_MAX_DOCS_TO_INCLUDE = parseInt(
    process.env.NEXT_PUBLIC_AI_MAX_DOCS || '2',
    10
);

/** Max tokens per individual doc in context */
export const AI_MAX_TOKENS_PER_DOC = parseInt(
    process.env.NEXT_PUBLIC_AI_MAX_TOKENS_PER_DOC || '800',
    10
);

/** Max tokens for feature context */
export const AI_MAX_TOKENS_FEATURE_CONTEXT = parseInt(
    process.env.NEXT_PUBLIC_AI_MAX_TOKENS_FEATURE || '500',
    10
);

// ===========================================
// MODEL CONFIGURATION
// ===========================================

/** Default model for fast/cheap operations */
export const AI_MODEL_CHAT = process.env.AI_MODEL_CHAT || 'glm-4.7';

/** Default model for complex reasoning */
export const AI_MODEL_REASONER = process.env.AI_MODEL_REASONER || 'deepseek-reasoner';

/** Default temperature for creative tasks */
export const AI_TEMPERATURE_CREATIVE = parseFloat(
    process.env.AI_TEMPERATURE_CREATIVE || '0.7'
);

/** Default temperature for filtering/precise tasks */
export const AI_TEMPERATURE_PRECISE = parseFloat(
    process.env.AI_TEMPERATURE_PRECISE || '0.1'
);

// ===========================================
// TOKEN LIMITS
// ===========================================

/** Max tokens for task descriptions */
export const AI_MAX_TOKENS_TASK = parseInt(
    process.env.AI_MAX_TOKENS_TASK || '1000',
    10
);

/** Max tokens for feature/epic descriptions */
export const AI_MAX_TOKENS_DESCRIPTION = parseInt(
    process.env.AI_MAX_TOKENS_DESCRIPTION || '1500',
    10
);

/** Max tokens for triage/filtering responses */
export const AI_MAX_TOKENS_TRIAGE = parseInt(
    process.env.AI_MAX_TOKENS_TRIAGE || '300',
    10
);

// ===========================================
// API ROUTES (for frontend use)
// ===========================================

export const API_ROUTES = {
    AI: {
        REFINE_TEXT: '/api/ai/refine-text',
        IMPROVE_EPIC_DESCRIPTION: '/api/ai/improve-epic-description',
        IMPROVE_FEATURE_DESCRIPTION: '/api/ai/improve-feature-description',
        IMPROVE_TASK_DESCRIPTION: '/api/ai/improve-task-description',
        GENERATE_TASK_DESCRIPTION: '/api/ai/generate-task-description',
        SUGGEST_TASKS: '/api/ai/suggest-tasks',
    },
} as const;

// ===========================================
// VALIDATION LIMITS
// ===========================================

/** Max characters for text refinement input */
export const AI_MAX_INPUT_CHARS = parseInt(
    process.env.NEXT_PUBLIC_AI_MAX_INPUT_CHARS || '10000',
    10
);
