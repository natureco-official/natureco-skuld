import { describe, expect, it } from 'vitest';

const {
  PROVIDERS,
  providerKeyFromUrl,
  getProviderModels,
  getSetupPresets,
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

  it('detects added provider URLs and live model endpoints', () => {
    expect(providerKeyFromUrl('https://api.moonshot.ai/v1')).toBe('kimi');
    expect(providerKeyFromUrl('https://api.z.ai/api/paas/v4')).toBe('glm');
    expect(getProviderModels('https://api.minimax.io')[0].id).toBe('MiniMax-M2.7');
    expect(findModelsEndpoint(PROVIDERS.kimi.url)).toBe('https://api.moonshot.ai/v1/models');
    expect(findModelsEndpoint(PROVIDERS.glm.url)).toBe('https://api.z.ai/api/paas/v4/models');
  });

  it('accepts number and model ID selections', () => {
    const available = getProviderModels('openai');
    expect(resolveModelSelection('2', available).id).toBe('gpt-5.6-terra');
    expect(resolveModelSelection('gpt-5.6-sol', available).id).toBe('gpt-5.6-sol');
    expect(resolveModelSelection('99', available)).toBeNull();
  });
});
