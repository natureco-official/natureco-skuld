'use strict';

// Provider API'leri hesap/model bazında canlı kaynak olmaya devam eder. Bu
// katalog yalnızca canlı liste alınamadığında setup ve komut yüzeylerinin aynı
// güçlü varsayılanlarda buluşmasını sağlar.
const PROVIDERS = {
  openai: { name: 'OpenAI (GPT)', url: 'https://api.openai.com/v1', default: 'gpt-5.6-sol', models: [
    ['gpt-5.6-sol', 'GPT-5.6 Sol', 'flagship', 'Complex reasoning and coding'],
    ['gpt-5.6-terra', 'GPT-5.6 Terra', 'balanced', 'Intelligence and cost balance'],
    ['gpt-5.6-luna', 'GPT-5.6 Luna', 'fast', 'High-volume work'],
    ['gpt-5.6', 'GPT-5.6 (latest alias)', 'flagship', 'Latest alias'],
  ] },
  anthropic: { name: 'Anthropic (Claude)', url: 'https://api.anthropic.com/v1', default: 'claude-fable-5', models: [
    ['claude-fable-5', 'Claude Fable 5', 'flagship', 'Most capable Claude'],
    ['claude-opus-5', 'Claude Opus 5', 'flagship', 'Complex agentic coding'],
    ['claude-sonnet-5', 'Claude Sonnet 5', 'balanced', 'Speed and intelligence balance'],
    ['claude-haiku-4-5', 'Claude Haiku 4.5', 'fast', 'Fast near-frontier model'],
  ] },
  gemini: { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta', default: 'gemini-3.5-flash', models: [
    ['gemini-3.6-flash', 'Gemini 3.6 Flash', 'flagship', 'Agentic multimodal coding'],
    ['gemini-3.5-flash', 'Gemini 3.5 Flash', 'flagship', 'Sustained agentic performance'],
    ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'fast', 'High throughput'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'preview', 'Frontier preview'],
  ] },
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1', default: 'openai/gpt-oss-120b', models: [
    ['openai/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Production reasoning'],
    ['openai/gpt-oss-20b', 'GPT-OSS 20B', 'fast', 'Fast production model'],
    ['qwen/qwen3.6-27b', 'Qwen 3.6 27B', 'preview', 'Coding and reasoning'],
    ['groq/compound', 'Groq Compound', 'agentic', 'Agentic system'],
  ] },
  deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', default: 'deepseek-chat', models: [
    ['deepseek-chat', 'DeepSeek Chat', 'balanced', 'General tools'],
    ['deepseek-reasoner', 'DeepSeek Reasoner', 'reasoning', 'Reasoning model'],
  ] },
  ollama: { name: 'Ollama (local)', url: 'http://localhost:11434/v1', default: 'qwen3-coder', models: [
    ['qwen3-coder', 'Qwen 3 Coder', 'flagship', 'Local coding'],
    ['llama4', 'Llama 4', 'flagship', 'Current Llama'],
    ['deepseek-r1', 'DeepSeek R1', 'reasoning', 'Local reasoning'],
    ['gemma3', 'Gemma 3', 'balanced', 'Efficient multimodal'],
  ] },
  minimax: { name: 'MiniMax', url: 'https://api.minimax.io', default: 'MiniMax-M2.7', models: [
    ['MiniMax-M2.7', 'MiniMax M2.7', 'flagship', 'Latest engineering agent'],
    ['MiniMax-M2.7-highspeed', 'MiniMax M2.7 Highspeed', 'fast', 'Faster M2.7'],
    ['MiniMax-M2.5', 'MiniMax M2.5', 'balanced', 'Code and refactoring'],
    ['MiniMax-M2.5-highspeed', 'MiniMax M2.5 Highspeed', 'fast', 'Faster M2.5'],
    ['MiniMax-M2.1', 'MiniMax M2.1', 'legacy', 'Previous generation'],
    ['MiniMax-M2', 'MiniMax M2', 'legacy', 'Legacy agent'],
  ] },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', default: 'openrouter/auto', models: [
    ['openrouter/auto', 'OpenRouter Auto', 'agentic', 'Automatic routing'],
    ['~openai/gpt-latest', 'OpenAI GPT Latest', 'flagship', 'Latest OpenAI alias'],
    ['x-ai/grok-4.5', 'Grok 4.5', 'flagship', 'Current Grok flagship'],
  ] },
  mistral: { name: 'Mistral AI', url: 'https://api.mistral.ai/v1', default: 'mistral-medium-latest', models: [
    ['mistral-medium-latest', 'Mistral Medium 3.5', 'flagship', 'Agentic coding'],
    ['mistral-small-latest', 'Mistral Small 4', 'balanced', 'Efficient hybrid'],
    ['mistral-large-latest', 'Mistral Large', 'flagship', 'Flagship alias'],
    ['codestral-latest', 'Codestral', 'coding', 'Code-focused'],
  ] },
  cohere: { name: 'Cohere', url: 'https://api.cohere.ai/v1', default: 'command-a-03-2025', models: [
    ['command-a-03-2025', 'Command A', 'flagship', 'Enterprise agent'],
    ['command-r7b-12-2024', 'Command R7B', 'fast', 'Efficient retrieval'],
    ['command-r-plus-08-2024', 'Command R+', 'legacy', 'Pinned R+'],
  ] },
  xai: { name: 'xAI (Grok)', url: 'https://api.x.ai/v1', default: 'grok-4.5', models: [
    ['grok-4.5', 'Grok 4.5', 'flagship', 'Code and agents'],
  ] },
  together: { name: 'Together AI', url: 'https://api.together.xyz/v1', default: 'MiniMaxAI/MiniMax-M3', models: [
    ['MiniMaxAI/MiniMax-M3', 'MiniMax M3', 'flagship', 'Current agent model'],
    ['Qwen/Qwen3.7-Max', 'Qwen 3.7 Max', 'flagship', 'Qwen flagship'],
    ['Qwen/Qwen3.6-Plus', 'Qwen 3.6 Plus', 'balanced', 'Long context'],
    ['moonshotai/Kimi-K3', 'Kimi K3', 'flagship', 'Current Kimi flagship'],
    ['moonshotai/Kimi-K2.7-Code', 'Kimi K2.7 Code', 'coding', 'Coding model'],
    ['deepseek-ai/DeepSeek-V4-Pro', 'DeepSeek V4 Pro', 'reasoning', 'Reasoning model'],
  ] },
  perplexity: { name: 'Perplexity', url: 'https://api.perplexity.ai', default: 'sonar-pro', models: [
    ['sonar-pro', 'Sonar Pro', 'flagship', 'Grounded search'],
    ['sonar', 'Sonar', 'fast', 'Fast search'],
    ['sonar-reasoning-pro', 'Sonar Reasoning Pro', 'reasoning', 'Grounded reasoning'],
    ['sonar-deep-research', 'Sonar Deep Research', 'research', 'Research reports'],
  ] },
  deepinfra: { name: 'DeepInfra', url: 'https://api.deepinfra.com/v1/openai', default: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo', models: [
    ['Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo', 'Qwen3 Coder 480B Turbo', 'coding', 'Current coding'],
    ['openai/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Open reasoning'],
    ['deepseek-ai/DeepSeek-V3.1-Terminus', 'DeepSeek V3.1 Terminus', 'balanced', 'General model'],
    ['zai-org/GLM-4.6', 'GLM 4.6', 'balanced', 'Agentic model'],
  ] },
  fireworks: { name: 'Fireworks AI', url: 'https://api.fireworks.ai/inference/v1', default: 'accounts/fireworks/models/gpt-oss-120b', models: [
    ['accounts/fireworks/models/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Serverless flagship'],
    ['accounts/fireworks/models/gpt-oss-20b', 'GPT-OSS 20B', 'fast', 'Fast serverless'],
  ] },
  natureco: { name: 'NatureCo', url: 'https://api.natureco.me/v1', default: 'natureco-default', models: [
    ['natureco-default', 'NatureCo Default', 'balanced', 'Automatic routing'],
    ['natureco-fast', 'NatureCo Fast', 'fast', 'Low latency'],
    ['natureco-reasoner', 'NatureCo Reasoner', 'reasoning', 'Reasoning route'],
  ] },
  kimi: { name: 'Moonshot AI (Kimi)', url: 'https://api.moonshot.ai/v1', default: 'kimi-k3', models: [
    ['kimi-k3', 'Kimi K3', 'flagship', 'Strongest Kimi'],
    ['kimi-k2.5', 'Kimi K2.5', 'flagship', 'Multimodal agent'],
    ['kimi-k2-thinking', 'Kimi K2 Thinking', 'reasoning', 'Long reasoning'],
  ] },
  glm: { name: 'Z.ai (GLM)', url: 'https://api.z.ai/api/paas/v4', default: 'glm-5.1', models: [
    ['glm-5.1', 'GLM 5.1', 'flagship', 'Long-horizon coding'],
    ['glm-5', 'GLM 5', 'flagship', 'Planning and debugging'],
    ['glm-5-turbo', 'GLM 5 Turbo', 'fast', 'Fast agents'],
    ['glm-4.7', 'GLM 4.7', 'balanced', 'Agentic coding'],
    ['glm-4.7-flashx', 'GLM 4.7 FlashX', 'fast', 'Fast lightweight'],
    ['glm-4.7-flash', 'GLM 4.7 Flash', 'fast', 'Free lightweight'],
  ] },
};

const HOST_TO_PROVIDER = [
  ['api.openai.com', 'openai'], ['api.anthropic.com', 'anthropic'],
  ['generativelanguage.googleapis.com', 'gemini'], ['api.groq.com', 'groq'],
  ['api.deepseek.com', 'deepseek'], ['localhost:11434', 'ollama'],
  ['api.minimax.io', 'minimax'], ['api.minimaxi.com', 'minimax'],
  ['openrouter.ai', 'openrouter'], ['api.mistral.ai', 'mistral'],
  ['api.cohere.ai', 'cohere'], ['api.x.ai', 'xai'], ['api.together.xyz', 'together'],
  ['api.perplexity.ai', 'perplexity'], ['api.deepinfra.com', 'deepinfra'],
  ['fireworks.ai', 'fireworks'], ['natureco.me', 'natureco'],
  ['api.moonshot.ai', 'kimi'], ['api.moonshot.cn', 'kimi'], ['api.z.ai', 'glm'],
];

function normalizeModels(models) {
  return models.map(([id, label, tier, desc]) => ({
    id, label, tier, desc, features: ['tool'], cost: '',
  }));
}

function providerKeyFromUrl(url = '') {
  const value = String(url).toLowerCase();
  return HOST_TO_PROVIDER.find(([host]) => value.includes(host))?.[1] || null;
}

function getProviderModels(urlOrKey = '') {
  const key = PROVIDERS[urlOrKey] ? urlOrKey : providerKeyFromUrl(urlOrKey);
  return key ? normalizeModels(PROVIDERS[key].models) : [];
}

function getSetupPresets(L = tr => tr) {
  const presets = {};
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    presets[key] = {
      name: key === 'groq' ? L('Groq (hızlı)', 'Groq (fast)') : provider.name,
      url: provider.url,
      default: provider.default,
      models: normalizeModels(provider.models),
    };
  }
  presets.custom = {
    name: 'Custom URL', url: '', default: 'custom',
    models: [{ id: 'custom', label: 'Custom', tier: 'custom', desc: L('Manuel model adı', 'Manual model ID'), cost: '' }],
  };
  return presets;
}

function applySetupCatalog(target, L) {
  const current = getSetupPresets(L);
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, current);
  return target;
}

module.exports = { PROVIDERS, providerKeyFromUrl, getProviderModels, getSetupPresets, applySetupCatalog };
