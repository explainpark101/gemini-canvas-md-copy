import {
  CITATION_MODE_STORAGE_KEY,
  DEFAULT_CITATION_MODE,
  isCitationMode,
  type CitationMode,
} from './citation-mode.ts';

const statusEl = document.getElementById('status');
const radios = document.querySelectorAll<HTMLInputElement>(
  'input[name="citationMode"]'
);

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

function selectMode(mode: CitationMode): void {
  for (const radio of radios) {
    radio.checked = radio.value === mode;
  }
}

async function loadMode(): Promise<void> {
  const stored = await chrome.storage.sync.get(CITATION_MODE_STORAGE_KEY);
  const raw = stored[CITATION_MODE_STORAGE_KEY];
  const mode = isCitationMode(raw) ? raw : DEFAULT_CITATION_MODE;
  selectMode(mode);
}

async function saveMode(mode: CitationMode): Promise<void> {
  await chrome.storage.sync.set({ [CITATION_MODE_STORAGE_KEY]: mode });
  setStatus('저장됨');
  window.setTimeout(() => setStatus(''), 1200);
}

for (const radio of radios) {
  radio.addEventListener('change', () => {
    if (!radio.checked || !isCitationMode(radio.value)) return;
    void saveMode(radio.value);
  });
}

void loadMode();
