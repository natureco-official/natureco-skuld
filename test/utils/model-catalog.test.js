import { describe, expect, it } from 'vitest';

const {
  PROVIDERS,
  providerKeyFromUrl,
  getProviderModels,
  getSetupPresets,
  getSetupModelChoices,
  contextWindowFor,
} = require('../../src/utils/model-catalog');
const {
  getKnownModels,
  findModelsEndpoint,
  resolveModelSelection,
} = require('../../src/commands/models');

describe('shared model catalogue', () => {
  it('contains the requested strongest current model families', () => {
    const ids = Object.values(PROVIDERS).flatMap(provider => provider.models.map(model => model[0]));
    expect(ids).toEqual(expect.arrayContaining([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'MiniMax-M2.7',
      'MiniMaxAI/MiniMax-M3',
      'kimi-k3',
      'moonshotai/Kimi-K3',
      'glm-5.1',
    ]));
  });

  it('feeds setup and models from the same provider source', () => {
    const setup = getSetupPresets((tr, en) => en);
    expect(setup.openai.default).toBe('gpt-5.6-sol');
    expect(setup.kimi.default).toBe('kimi-k3');
    expect(setup.glm.default).toBe('glm-5.1');
    expect(getKnownModels(PROVIDERS.anthropic.url)[0].id).toBe('claude-fable-5');
  });

  it('renders setup choices as model names only', () => {
    const setup = getSetupPresets((tr, en) => en);
    for (const preset of Object.values(setup).filter(item => item.models[0]?.id !== 'custom')) {
      const choices = getSetupModelChoices(preset);
      expect(choices).toHaveLength(preset.models.length);
      expect(choices.every(choice => typeof choice.name === 'string' && typeof choice.value === 'string')).toBe(true);
      expect(choices.some(choice => choice.name === '[object Object]')).toBe(false);
      expect(choices.map(choice => choice.name)).toEqual(preset.models.map(model => model.label));
    }
  });

  // Referans listesi DONDURULMUS halde burada duruyor.
  //
  // Eskiden bu test natureco-cli deposunu diskteki MUTLAK yoldan require
  // ediyordu (`C:/Projects/...`). O yol yalnizca tek bir makinede vardi:
  // CI'da ve baska her gelistiricide test "modul bulunamadi" ile dusuyordu.
  // Skuld zaten natureco-cli bagini kasten kesti; bir testin baska bir deponun
  // diskte durmasina bagli olmasi o karari da delik birakiyordu.
  //
  // Liste boylece bir MANDAL olur: Skuld katalogundan bu kimliklerden biri
  // dusarse test dusiyor. Referansa yeni model eklenirse buraya da bilerek
  // eklenir.
  const REFERANS_MODELLER = {
    "openai": ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6"],
    "anthropic": ["claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-haiku-4-5-20251001"],
    "gemini": ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"],
    "groq": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "groq/compound", "groq/compound-mini"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "ollama": ["qwen3-coder", "llama4", "deepseek-r1", "gemma3"],
    "minimax": ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"],
    "openrouter": ["openrouter/auto", "~openai/gpt-latest", "x-ai/grok-4.5"],
    "mistral": ["mistral-medium-latest", "mistral-small-latest", "mistral-large-latest", "codestral-latest"],
    "cohere": ["command-a-03-2025", "command-r7b-12-2024", "command-r-plus-08-2024", "command-r-08-2024"],
    "xai": ["grok-4.5"],
    "together": ["MiniMaxAI/MiniMax-M3", "Qwen/Qwen3.7-Max", "Qwen/Qwen3.6-Plus", "moonshotai/Kimi-K3", "moonshotai/Kimi-K2.7-Code", "deepseek-ai/DeepSeek-V4-Pro", "openai/gpt-oss-120b"],
    "perplexity": ["sonar-pro", "sonar", "sonar-reasoning-pro", "sonar-deep-research"],
    "deepinfra": ["Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo", "openai/gpt-oss-120b", "deepseek-ai/DeepSeek-V3.1-Terminus", "zai-org/GLM-4.6"],
    "fireworks": ["accounts/fireworks/models/gpt-oss-120b", "accounts/fireworks/models/gpt-oss-20b"],
    "natureco": ["natureco-default", "natureco-fast", "natureco-reasoner"],
    "kimi": ["kimi-k3", "kimi-k2.5", "kimi-k2-thinking"],
    "glm": ["glm-5.1", "glm-5", "glm-5-turbo", "glm-4.7", "glm-4.7-flashx", "glm-4.7-flash", "glm-4.6", "glm-4.5-flash"],
  };

  it('contains every model ID from the NatureCo Code reference catalogue', () => {
    for (const [provider, ids] of Object.entries(REFERANS_MODELLER)) {
      expect(PROVIDERS[provider], `saglayici eksik: ${provider}`).toBeDefined();
      const skuldIds = new Set(PROVIDERS[provider].models.map(model => model[0]));
      expect(ids.filter(id => !skuldIds.has(id))).toEqual([]);
    }
  });

  it('detects added provider URLs and live model endpoints', () => {
    expect(providerKeyFromUrl('https://api.moonshot.ai/v1')).toBe('kimi');
    expect(providerKeyFromUrl('https://api.z.ai/api/paas/v4')).toBe('glm');
    expect(getProviderModels('https://api.minimax.io')[0].id).toBe('MiniMax-M2.7');
    expect(findModelsEndpoint(PROVIDERS.kimi.url)).toBe('https://api.moonshot.ai/v1/models');
    expect(findModelsEndpoint(PROVIDERS.glm.url)).toBe('https://api.z.ai/api/paas/v4/models');
  });

  // Bağlam bütçesi elle yazılmış 16.384'tü ve modelden habersizdi; 200k
  // pencereli bir modelde ajan, yerin %94'ü boşken konuşmayı buduyordu.
  it('knows the real context window of the models it ships', () => {
    expect(contextWindowFor('MiniMax-M2.7')).toBe(204_800);
    expect(contextWindowFor('MiniMax-M2.5-highspeed')).toBe(204_800);
    expect(contextWindowFor('MiniMax-M2')).toBe(204_800);
    expect(contextWindowFor('claude-opus-5')).toBe(200_000);
    expect(contextWindowFor('claude-haiku-4-5-20251001')).toBe(200_000);
    expect(contextWindowFor('gemini-3.5-flash')).toBe(1_048_576);
    expect(contextWindowFor('deepseek-reasoner')).toBe(128_000);
  });

  // Bilmediğimiz bir modele pencere UYDURMAK, isteğin sağlayıcı tarafından
  // tamamen reddedilmesi demek. Bilmiyorsak söylemiyoruz; bütçe o zaman elle
  // ayarlanmış profile düşüyor ve en kötü ihtimalle erken budama oluyor.
  it('says nothing rather than guessing for an unknown model', () => {
    expect(contextWindowFor('bilinmeyen-model-9')).toBeNull();
    expect(contextWindowFor('')).toBeNull();
    expect(contextWindowFor(undefined)).toBeNull();
    expect(contextWindowFor('qwen3-coder')).toBeNull();
  });

  it('accepts number and model ID selections', () => {
    const available = getProviderModels('openai');
    expect(resolveModelSelection('2', available).id).toBe('gpt-5.6-terra');
    expect(resolveModelSelection('gpt-5.6-sol', available).id).toBe('gpt-5.6-sol');
    expect(resolveModelSelection('99', available)).toBeNull();
  });
});
