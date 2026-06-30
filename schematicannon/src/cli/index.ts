#!/usr/bin/env node
import { Command } from 'commander';
import { join, resolve } from 'node:path';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { fetchModrinthCreateVersions, mapSupportedVersions } from '../loader/versions.js';
import { importMinecraftVersionResources, importCreateVersionResources } from '../util/import.js';

const program = new Command();

program
  .name('schematicannon')
  .description('CLI tool for Schematicannon library')
  .version('0.1.0');

program
  .command('generate-assets')
  .description('Download and prepare assets for Create and Minecraft')
  .option('-d, --directory <path>', 'Output directory for assets', './assets')
  .option('--clear', 'Clear the output directory before starting', false)
  .action(async options => {
    const assetsDir = resolve(process.cwd(), options.directory);
    const clear = options.clear;

    if (clear) {
      console.log(`Clearing ${assetsDir}...`);
      await rm(assetsDir, { recursive: true, force: true });
    }

    console.log(`Generating assets in: ${assetsDir}`);

    try {
      const modrinthVersions = await fetchModrinthCreateVersions();
      const supportedVersions = mapSupportedVersions(modrinthVersions);
      const { minecraft: minecraftVersions, create: createVersions } = supportedVersions;

      console.log(`Found ${modrinthVersions.length} Create versions supporting ${minecraftVersions.length} Minecraft versions.`);

      console.log('Saving supportedVersions.json...');
      await mkdir(assetsDir, { recursive: true });
      await writeFile(join(assetsDir, 'supportedVersions.json'), JSON.stringify(supportedVersions, null, 2));

      console.log('--- Minecraft synchronization ---');
      console.log(`Target versions: ${minecraftVersions.join(', ')}`);
      for (const version of minecraftVersions) {
        await importMinecraftVersionResources(version, assetsDir);
      }

      console.log('--- Create synchronization ---');
      console.log(`Target versions: ${createVersions.map(c => c.version).join(', ')}`);
      for (const createInfo of createVersions) {
        const version = createInfo.version;
        // Match both old format "mc1.21.1-6.0.9" and new format "6.0.10+mc1.21.1"
        const matching = modrinthVersions.filter(v =>
          v.version_number === version ||
          v.version_number.endsWith(`-${version}`) ||
          v.version_number.startsWith(`${version}+`)
        );
        const allFiles = matching.flatMap(v => v.files);
        const jars = allFiles.filter(f => f.filename.endsWith('.jar'));

        if (jars.length === 0) {
          console.warn(`[Create ${version}] No JAR files found!`);
          continue;
        }

        const largestJar = jars.reduce((prev, current) => (prev.size > current.size) ? prev : current);
        await importCreateVersionResources(version, largestJar.url, assetsDir);
      }

      console.log('---');
      console.log('Asset synchronization complete.');
    } catch (err) {
      console.error('Fatal error during asset import:', err);
      process.exit(1);
    }
  });

program.parse();
