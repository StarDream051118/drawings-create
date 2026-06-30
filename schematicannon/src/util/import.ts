import { execSync } from 'node:child_process';
import { mkdir, writeFile, rm, stat, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';

export async function importMinecraftVersionResources (version: string, assetsDir: string = join(process.cwd(), 'assets')) {
  const branches = {
    summary: {
      'registries/data.min.json': 'items.json',
      'assets/block_definition/data.min.json': 'block_definition.json',
      'assets/model/data.min.json': 'model.json',
      'assets/item_definition/data.min.json': 'item_definition.json',
      'item_components/data.min.json': 'item_components.json'
    },
    atlas: {
      'all/data.min.json': 'atlas.json',
      'all/atlas.png': 'atlas.png'
    }
  };

  const baseDir = join(assetsDir, 'minecraft', version);
  await mkdir(baseDir, { recursive: true });

  for (const [branch, files] of Object.entries(branches)) {
    const localFiles = Object.values(files);
    let allFilesExist = true;
    for (const f of localFiles) {
      try {
        await stat(join(baseDir, f));
      } catch {
        allFilesExist = false;
        break;
      }
    }

    if (allFilesExist) {
      console.log(`[${version}] Skipping ${branch} - all files already present.`);
      continue;
    }

    const url = `https://github.com/misode/mcmeta/archive/refs/tags/${version}-${branch}.zip`;
    const zipPath = join(process.cwd(), `temp-${version}-${branch}.zip`);

    console.log(`[${version}] Downloading ${branch} assets...`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[${version}] Skipping ${branch}: ${response.status} ${response.statusText}`);
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(zipPath, buffer);

    const zipFolder = `mcmeta-${version}-${branch}`;

    try {
      // List files to avoid errors on missing optional files (older versions)
      const zipList = execSync(`unzip -l "${zipPath}"`).toString();

      for (const [zipFile, localFile] of Object.entries(files)) {
        const fullZipPath = `${zipFolder}/${zipFile}`;

        if (!zipList.includes(fullZipPath)) {
          console.log(`[${version}] Skipping optional ${localFile} (not in archive).`);
          continue;
        }

        console.log(`[${version}] Extracting ${localFile}...`);
        const content = execSync(`unzip -p "${zipPath}" "${fullZipPath}"`, { maxBuffer: 100 * 1024 * 1024 });

        if (localFile === 'items.json') {
          const data = JSON.parse(content.toString());
          const items = data.item || data['minecraft:item'] || [];
          await writeFile(join(baseDir, localFile), JSON.stringify(items));
        } else {
          await writeFile(join(baseDir, localFile), content);
        }
      }
    } finally {
      await rm(zipPath);
    }
  }
}

export async function hasCreateAssets (version: string, assetsDir: string = join(process.cwd(), 'assets')): Promise<boolean> {
  const base = join(assetsDir, 'create', version);
  const required = ['blockstates', 'models', 'textures'];

  for (const dir of required) {
    const full = join(base, dir);
    try {
      const s = await stat(full);
      if (!s.isDirectory()) {
        return false;
      }
      const entries = await readdir(full);
      if (entries.length === 0) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export async function importCreateVersionResources (version: string, jarUrl: string, assetsDir: string = join(process.cwd(), 'assets')) {
  if (await hasCreateAssets(version, assetsDir)) {
    console.log(`[Create ${version}] Skipping - assets already present.`);
    return;
  }

  const baseDir = join(assetsDir, 'create', version);
  await mkdir(baseDir, { recursive: true });

  const jarPath = join(process.cwd(), `temp-create-${version}.jar`);

  console.log(`[Create ${version}] Downloading JAR...`);
  const response = await fetch(jarUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Create JAR: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(jarPath, buffer);

  try {
    // Validate JAR content before extraction
    const list = execSync(`unzip -l "${jarPath}" "assets/create/*"`).toString();
    if (!list.includes('assets/create/')) {
      throw new Error(`JAR for ${version} does not contain assets/create/`);
    }

    console.log(`[Create ${version}] Extracting assets/create/*...`);
    const tempExtract = join(process.cwd(), `temp-extract-create-${version}`);
    // Clear tempExtract if it exists to avoid prompts
    await rm(tempExtract, { recursive: true, force: true }).catch(() => {
    });
    await mkdir(tempExtract, { recursive: true });

    // -q for quiet, -o for overwrite (essential for case-insensitive filesystems like macOS), -d for destination
    execSync(`unzip -qo "${jarPath}" "assets/create/*" -d "${tempExtract}"`);

    const extractedDir = join(tempExtract, 'assets', 'create');
    await cp(extractedDir, baseDir, { recursive: true });

    await ensureModelManifest(baseDir);

    await rm(tempExtract, { recursive: true, force: true }).catch(() => {
    });
  } finally {
    await rm(jarPath).catch(() => {
    });
  }
}

async function collectModelIds (dir: string, relativePath = '', bucket = new Set<string>()): Promise<Set<string>> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectModelIds(join(dir, entry.name), nextPath, bucket);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const withoutExtension = nextPath.replace(/\.json$/, '');
    bucket.add(`create:${withoutExtension}`);
  }
  return bucket;
}

async function ensureModelManifest (basePath: string) {
  const modelsDir = join(basePath, 'models');
  try {
    const s = await stat(modelsDir);
    if (!s.isDirectory()) {
      // Should not happen if we just extracted
      return;
    }
  } catch {
    return;
  }

  const ids = Array.from(await collectModelIds(modelsDir));
  ids.sort();
  const manifestPath = join(basePath, 'model_manifest.json');
  await writeFile(manifestPath, JSON.stringify(ids, null, 2) + '\n', 'utf-8');
  console.log(`[model_manifest] Wrote ${ids.length} entries to ${manifestPath}`);
}
