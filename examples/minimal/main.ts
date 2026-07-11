
import { createStructureViewer, FetchResourceProvider, type SupportedVersions } from '../../src';

const logPanel = document.getElementById('log-panel')!;
function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  const ts = new Date().toLocaleTimeString();
  const el = document.createElement('div');
  el.className = `log-${level}`;
  el.textContent = `[${ts}] ${msg}`;
  logPanel.appendChild(el);
  logPanel.scrollTop = logPanel.scrollHeight;
  if (level === 'error') console.error(msg);
  else if (level === 'warn') console.warn(msg);
  else console.log(msg);
}

log('Script loaded');

const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const fileInput = document.getElementById('nbt-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;
const createSelect = document.getElementById('create-select') as HTMLSelectElement;
const mcSelect = document.getElementById('minecraft-select') as HTMLSelectElement;
const showGridCheckbox = document.getElementById('show-grid') as HTMLInputElement;
const animateKineticsCheckbox = document.getElementById('animate-kinetics') as HTMLInputElement;

log(`DOM elements: canvas=${!!canvas} fileInput=${!!fileInput} statusEl=${!!statusEl} createSelect=${!!createSelect} mcSelect=${!!mcSelect} showGrid=${!!showGridCheckbox} kinetics=${!!animateKineticsCheckbox}`);

if (!canvas) {
  log('Canvas element #viewport not found', 'error');
  if (statusEl) statusEl.textContent = 'Canvas not found.';
} else {
  log(`Canvas found: ${canvas.clientWidth}x${canvas.clientHeight}`);

  const gl = canvas.getContext('webgl');
  if (!gl) {
    log('WebGL not supported in this browser', 'error');
  } else {
    log(`WebGL OK: ${gl.getParameter(gl.RENDERER)}`);
  }

  let viewer: ReturnType<typeof createStructureViewer> | null = null;
  let currentFile: File | null = null;

  const updateViewer = async () => {
    const currentCreateVersion = createSelect.value;
    const currentMcVersion = mcSelect.value;
    log(`updateViewer called: Create="${currentCreateVersion}" MC="${currentMcVersion}"`);

    if (viewer) {
      log('Disposing previous viewer');
      viewer.dispose();
      viewer = null;
    }

    if (!currentCreateVersion || !currentMcVersion) {
      log('No version selected, skipping viewer init', 'warn');
      return;
    }

    log(`Initializing viewer: Create ${currentCreateVersion} / MC ${currentMcVersion}`);
    statusEl.textContent = `Initializing viewer for Create ${currentCreateVersion} / MC ${currentMcVersion}`;

    // Strip "+mcX.Y.Z" suffix — asset directories use bare Create version numbers
    const createVersionDir = currentCreateVersion.includes('+mc')
      ? currentCreateVersion.slice(0, currentCreateVersion.indexOf('+mc'))
      : currentCreateVersion;
    const createAssetsPath = `assets/create/${createVersionDir}/`;
    const vanillaAssetsPath = `assets/minecraft/${currentMcVersion}/`;
    log(`Create assets: ${createAssetsPath}`);
    log(`Vanilla assets: ${vanillaAssetsPath}`);

    const createAssets = new FetchResourceProvider(createAssetsPath);
    const vanillaAssets = new FetchResourceProvider(vanillaAssetsPath);

    try {
      const aeronauticsAssets = new FetchResourceProvider('assets/aeronautics/');
      const simulatedAssets = new FetchResourceProvider('assets/simulated/');

      log('Calling createStructureViewer...');
      viewer = createStructureViewer({
        canvas,
        createAssetsBase: createAssets,
        vanillaAssetsBase: vanillaAssets,
        addons: [
          { namespace: 'aeronautics', provider: aeronauticsAssets },
          { namespace: 'simulated', provider: simulatedAssets }
        ],
        enableResize: true,
        enableMouseControls: true
      });
      log('createStructureViewer returned, viewer=' + (viewer ? 'OK' : 'null'));

      viewer.observer.subscribe(event => {
        if (event.type === 'loading-progress') {
          log(`[progress] ${event.message}`);
          statusEl.textContent = event.message;
        } else if (event.type === 'fatal-error') {
          log(`[FATAL] ${event.message}`, 'error');
          if (event.error) log(`  Detail: ${event.error}`, 'error');
          statusEl.textContent = 'Error: ' + event.message;
        } else if (event.type === 'structure-loaded') {
          log('Structure loaded and rendering!');
          statusEl.textContent = 'Structure loaded successfully!';
        } else {
          log(`[event] ${event.type}`);
        }
      });

      if (currentFile) {
        log(`Loading file: ${currentFile.name} (${currentFile.size} bytes)`);
        await viewer.loadStructure(currentFile);
      } else {
        // Auto-load default test file
        try {
          const res = await fetch('test.nbt');
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            log('Auto-loading test.nbt...');
            await viewer.loadStructure(buffer);
          } else {
            log('No NBT file selected. Ready for input.');
            statusEl.textContent = 'Ready. Choose an NBT file.';
          }
        } catch {
          log('No NBT file selected. Ready for input.');
          statusEl.textContent = 'Ready. Choose an NBT file.';
        }
      }
    } catch (e: any) {
      log(`Viewer creation failed: ${e?.message ?? e}`, 'error');
      if (e?.stack) log(`Stack: ${e.stack}`, 'error');
      viewer = null;
      statusEl.textContent = 'Error creating viewer: ' + (e?.message ?? e);
    }
  };

  try {
    log('Fetching supportedVersions.json...');
    const supportedVersionsResponse = await fetch('assets/supportedVersions.json');
    log(`Fetch response status: ${supportedVersionsResponse.status}`);
    if (!supportedVersionsResponse.ok) {
      log(`supportedVersions.json fetch failed: ${supportedVersionsResponse.status}`, 'error');
      statusEl.textContent = 'Failed to load supported versions.';
      throw new Error('Failed to load supported versions');
    }
    const supported: SupportedVersions = await supportedVersionsResponse.json();
    log(`Loaded supported versions: ${supported.create.length} Create versions, ${JSON.stringify(supported.create.map(c => c.version))}`);

    supported.create.forEach(c => {
      const option = document.createElement('option');
      option.value = c.version;
      option.textContent = `Create ${c.version}`;
      createSelect.appendChild(option);
    });
    if (Array.from(createSelect.options).some(o => o.value === '6.0.9')) {
      createSelect.value = '6.0.9';
    }
    log(`Create select populated: ${createSelect.options.length} options, selected: "${createSelect.value}"`);

    const updateMcSelect = async () => {
      const createVersion = createSelect.value;
      log(`updateMcSelect called for Create ${createVersion}`);
      const mapping = supported.create.find(c => c.version === createVersion);
      const previousMc = mcSelect.value;

      mcSelect.innerHTML = '';
      mapping?.game_versions.sort().reverse().forEach(mc => {
        const option = document.createElement('option');
        option.value = mc;
        option.textContent = `MC ${mc}`;
        mcSelect.appendChild(option);
      });

      if (previousMc && Array.from(mcSelect.options).some(o => o.value === previousMc)) {
        mcSelect.value = previousMc;
      }

      log(`MC select: ${mcSelect.options.length} options, selected: "${mcSelect.value}"`);
      await updateViewer();
    };

    createSelect.addEventListener('change', async () => {
      log(`Create version changed to: ${createSelect.value}`);
      await updateMcSelect();
    });
    mcSelect.addEventListener('change', async () => {
      log(`MC version changed to: ${mcSelect.value}`);
      await updateViewer();
    });

    log('Calling initial updateMcSelect...');
    await updateMcSelect();
    log('Initialization complete, viewer=' + (viewer ? 'OK' : 'null'));
  } catch (e: any) {
    log(`Init failed: ${e?.message ?? e}`, 'error');
    if (e?.stack) log(`Stack: ${e.stack}`, 'error');
    statusEl.textContent = 'Failed to load supported versions.';
  }

  showGridCheckbox.addEventListener('change', () => {
    if (viewer) viewer.setShowGrid(showGridCheckbox.checked);
  });
  animateKineticsCheckbox.addEventListener('change', () => {
    if (viewer) viewer.setAnimateKinetics(animateKineticsCheckbox.checked);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) {
      log(`File selected: ${file.name} (${file.size} bytes, type: ${file.type})`);
      currentFile = file;
      if (viewer) {
        log('Sending file to viewer...');
        await viewer.loadStructure(file);
      } else {
        log('No viewer initialized yet', 'warn');
      }
    }
  });
}
