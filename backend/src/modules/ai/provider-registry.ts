/**
 * OpenRouter model catalog.
 * UI uses this list to let admins pick which model to use.
 * Full list: https://openrouter.ai/models
 */

export type OpenRouterModel = {
  group: string;
  title: string;
  value: string; // model slug passed to OpenRouter API
};

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  // Anthropic
  { group: 'Anthropic', title: 'Claude Sonnet 4.5',     value: 'anthropic/claude-sonnet-4-5' },
  { group: 'Anthropic', title: 'Claude 3.5 Sonnet',     value: 'anthropic/claude-3.5-sonnet' },
  { group: 'Anthropic', title: 'Claude 3.5 Haiku',      value: 'anthropic/claude-3.5-haiku' },
  { group: 'Anthropic', title: 'Claude 3 Opus',         value: 'anthropic/claude-3-opus' },
  // Google
  { group: 'Google',    title: 'Gemini 2.0 Flash',      value: 'google/gemini-2.0-flash-001' },
  { group: 'Google',    title: 'Gemini 2.5 Flash',      value: 'google/gemini-2.5-flash' },
  { group: 'Google',    title: 'Gemini 1.5 Pro',        value: 'google/gemini-pro-1.5' },
  // OpenAI
  { group: 'OpenAI',   title: 'GPT-4o',                value: 'openai/gpt-4o' },
  { group: 'OpenAI',   title: 'GPT-4o Mini',           value: 'openai/gpt-4o-mini' },
  { group: 'OpenAI',   title: 'o4 Mini',               value: 'openai/o4-mini' },
  // Meta Llama
  { group: 'Meta',     title: 'Llama 3.3 70B',         value: 'meta-llama/llama-3.3-70b-instruct' },
  { group: 'Meta',     title: 'Llama 3.1 8B',          value: 'meta-llama/llama-3.1-8b-instruct' },
  // DeepSeek
  { group: 'DeepSeek', title: 'DeepSeek Chat V3',      value: 'deepseek/deepseek-chat-v3-0324' },
  { group: 'DeepSeek', title: 'DeepSeek R1',           value: 'deepseek/deepseek-r1' },
  // Qwen
  { group: 'Qwen',     title: 'Qwen3 235B',            value: 'qwen/qwen3-235b-a22b' },
  { group: 'Qwen',     title: 'Qwen3 30B',             value: 'qwen/qwen3-30b-a3b' },
  // Mistral
  { group: 'Mistral',  title: 'Mistral Large',         value: 'mistralai/mistral-large' },
  { group: 'Mistral',  title: 'Mistral Small 3.1 24B', value: 'mistralai/mistral-small-3.1-24b-instruct' },
];

