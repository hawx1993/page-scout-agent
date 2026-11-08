import {
  modelConfigSchema,
  providerById,
  type ModelProfile,
  type ProviderId,
} from '../shared/models';

export type ModelSettings = {
  active: ProviderId | 'server';
  profiles: Partial<Record<ProviderId, ModelProfile>>;
};
const storageKey = 'sitelens.models.v1';
const ids: ProviderId[] = ['deepseek', 'kimi', 'openai', 'zhipu', 'custom'];

export function newProfile(provider: ProviderId): ModelProfile {
  const preset = providerById(provider);
  return {
    provider,
    model: preset.models[0] || '',
    apiKey: '',
    baseUrl: preset.baseUrl,
    rememberKey: true,
  };
}
export function loadModelSettings(storage?: Pick<Storage, 'getItem'>): ModelSettings {
  try {
    const parsed = JSON.parse((storage ?? localStorage).getItem(storageKey) || '{}');
    const profiles: ModelSettings['profiles'] = {};
    for (const id of ids) {
      const raw = parsed.profiles?.[id];
      if (!raw || typeof raw !== 'object') continue;
      // Empty keys are valid saved metadata for session-only profiles.
      const validated = modelConfigSchema.safeParse({
        ...raw,
        apiKey: raw.apiKey || 'metadata-only',
      });
      if (validated.success && validated.data.provider === id)
        profiles[id] = {
          ...validated.data,
          apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
          rememberKey: raw.rememberKey === true,
        };
    }
    return {
      active: parsed.active === 'server' || ids.includes(parsed.active) ? parsed.active : 'server',
      profiles,
    };
  } catch {
    return { active: 'server', profiles: {} };
  }
}
export function saveModelSettings(settings: ModelSettings, storage?: Pick<Storage, 'setItem'>) {
  const profiles = Object.fromEntries(
    Object.entries(settings.profiles).map(([id, profile]) => [
      id,
      { ...profile, apiKey: profile.rememberKey ? profile.apiKey : '' },
    ]),
  );
  (storage ?? localStorage).setItem(
    storageKey,
    JSON.stringify({ active: settings.active, profiles }),
  );
}
