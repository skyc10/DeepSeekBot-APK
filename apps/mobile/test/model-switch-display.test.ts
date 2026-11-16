import { describe, expect, it } from 'vitest';

import { currentModel, loadGlobalModel, type BotModel } from '../src/host/bot-settings';
import { createHostClient } from '../src/host/client';
import {
  classifyModelList,
  getModelSourceSnapshot,
  recordModelSource,
  searchModels,
} from '../src/host/model-settings';
import { FakeHost } from './fake-host';

const models = [
  { provider: 'deepseek', providerName: 'DeepSeek', model: 'flash', modelName: 'Flash', efforts: [] },
  { provider: 'deepseek', providerName: 'DeepSeek', model: 'pro', modelName: 'Pro', efforts: [] },
  { provider: 'openai', providerName: 'OpenAI', model: 'gpt-4o', modelName: 'GPT-4o', efforts: [] },
];
const flash = { provider: 'deepseek', model: 'flash' };
const pro = { provider: 'deepseek', model: 'pro' };

function globalClient() {
  const fake = new FakeHost();
  fake.methods.set('modelCatalog', () => ({ models, default: flash, defaultRevision: 1 }));
  fake.methods.set('modelPresets', () => ({ presets: [] }));
  const client = createHostClient({
    routes: ['https://studio.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  return { fake, client };
}

describe('model switch list', () => {
  it('lists every catalog model, not just the global default', async () => {
    const { client } = globalClient();
    const state = await loadGlobalModel(client);
    expect(state.models).toHaveLength(models.length);
    expect(searchModels(state.models, '')).toHaveLength(models.length);
    expect(searchModels(state.models, 'pro').map((entry) => entry.model)).toEqual(['pro']);
  });
});

describe('thin and failed catalog states', () => {
  it('classifies empty, single and failed catalogs distinctly', () => {
    expect(classifyModelList(0)).toBe('empty');
    expect(classifyModelList(1)).toBe('single');
    expect(classifyModelList(2)).toBe('ok');
    expect(classifyModelList(2, true)).toBe('failed');
    expect(classifyModelList(0, true)).toBe('failed');
  });

  it('records which projection supplied the list', () => {
    recordModelSource('catalog.models', 3);
    const last = getModelSourceSnapshot().at(-1);
    expect(last?.source).toBe('catalog.models');
    expect(last?.count).toBe(3);
  });

  it('keeps credential-missing models visible instead of hiding them', () => {
    const withMissing = [
      ...models,
      {
        provider: 'openai',
        providerName: 'OpenAI',
        model: 'locked',
        modelName: 'Locked',
        credential: 'missing' as const,
        efforts: [],
      },
    ];
    const entries = searchModels(withMissing, '');
    expect(entries).toHaveLength(models.length + 1);
    expect(entries.some((entry) => entry.credential === 'missing')).toBe(true);
  });
});

describe('model switch selection', () => {
  it('reports the switched route as the current selection', () => {
    const switched: BotModel = {
      revision: 2,
      models,
      presets: [],
      fallback: flash,
      plan: {
        revision: 2,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: pro,
      },
    };
    expect(currentModel(switched).route).toEqual(pro);

    const inherited: BotModel = { revision: 0, models, presets: [], fallback: flash };
    expect(currentModel(inherited).route).toEqual(flash);
  });
});
