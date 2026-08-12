import {
  CITATION_MODE_STORAGE_KEY,
  getStoredCitationMode,
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
  const mode = await getStoredCitationMode();
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
