const MODRINTH_CREATE_VERSIONS_ENDPOINT = 'https://api.modrinth.com/v3/project/LNytGWDc/version?include_changelog=false';

export interface ModrinthCreateVersion {
  id: string;
  version_number: string;
  date_published: string;
  files: {
    url: string;
    filename: string;
    size: number;
  }[];
  loaders: string[];
  game_versions: string[];
}

export async function fetchModrinthCreateVersions (): Promise<ModrinthCreateVersion[]> {
  const response = await fetch(MODRINTH_CREATE_VERSIONS_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Failed to fetch Modrinth Create versions: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data as ModrinthCreateVersion[];
}

export interface SupportedVersions {
  create: { version: string; game_versions: string[] }[];
  minecraft: string[];
}

export function mapSupportedVersions (modrinthVersions: ModrinthCreateVersion[]): SupportedVersions {
  // create versions_number strings look like mc1.21.1-6.0.9 or 1.18.2-0.5.0a or 6.0.10+mc1.21.1
  const createVersions = new Set<string>();
  const minecraftVersions = new Set<string>();

  for (let version of modrinthVersions) {
    const versionNum = version.version_number;
    let createVersion: string;
    if (versionNum.includes('+mc')) {
      // New format: "6.0.10+mc1.21.1" → version="6.0.10", mc from "+mc" suffix
      createVersion = versionNum.slice(0, versionNum.indexOf('+mc'));
      const mcFromSuffix = versionNum.slice(versionNum.indexOf('+mc') + 3);
      if (mcFromSuffix && !version.game_versions.includes(mcFromSuffix)) {
        version = { ...version, game_versions: [...version.game_versions, mcFromSuffix] };
      }
    } else {
      // Old format: "mc1.21.1-6.0.9" or "1.18.2-0.5.0a"
      createVersion = versionNum.slice(versionNum.indexOf('-') + 1);
    }
    createVersions.add(createVersion);

    version.game_versions.forEach(minecraftVersion => minecraftVersions.add(minecraftVersion));
  }

  const supportedVersionsCreate = Array.from(createVersions).map(version => {
    const gameVersions = modrinthVersions
      .filter(v =>
        v.version_number === version ||
        v.version_number.endsWith(`-${version}`) ||
        v.version_number.startsWith(`${version}+`)
      )
      .flatMap(v => v.game_versions);
    return { version, game_versions: Array.from(new Set(gameVersions)) };
  });

  return {
    create: supportedVersionsCreate,
    minecraft: Array.from(minecraftVersions)
  };
}

