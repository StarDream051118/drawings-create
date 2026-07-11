import { ResourceProvider } from '../loader/resourceProvider.js';

const MODEL_MANIFEST_FILE = 'model_manifest.json';

export async function loadCreateModelManifest (provider: ResourceProvider): Promise<string[]> {
  try {
    const payload = await provider.getJson(MODEL_MANIFEST_FILE);
    if (!Array.isArray(payload) || !payload.every(p => typeof p === 'string')) {
      throw new Error('Create model manifest is invalid (expected string array)');
    }
    return payload;
  } catch (err) {
    throw new Error(`Failed to fetch Create model manifest: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export { MODEL_MANIFEST_FILE };
