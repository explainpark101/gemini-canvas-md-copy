/**
 * Context menu registration, citation-mode action state, and click handlers.
 */

import {
  CITATION_MODE_LABELS,
  CITATION_MODE_STORAGE_KEY,
  DEFAULT_CITATION_MODE,
  isCitationMode,
  type CitationMode,
} from './citation-mode.ts';

const COPY_SELECTION_MENU_ID = 'copySelectionAsMarkdown';
const OPEN_CITATION_MODE_MENU_ID = 'openCitationModePopup';

const GEMINI_URL_PATTERNS = ['https://gemini.google.com/*'];

function citationActionTitle(mode: CitationMode): string {
  return `출처 복사: ${CITATION_MODE_LABELS[mode]}`;
}

async function applyCitationModeToAction(mode: CitationMode): Promise<void> {
  await chrome.action.setTitle({ title: citationActionTitle(mode) });
  await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  await chrome.action.setBadgeText({
    text: mode === 'none' ? '' : mode === 'footnote' ? '각주' : '링크',
  });
}

async function ensureDefaultCitationMode(): Promise<CitationMode> {
  const stored = await chrome.storage.sync.get(CITATION_MODE_STORAGE_KEY);
  if (isCitationMode(stored[CITATION_MODE_STORAGE_KEY])) {
    return stored[CITATION_MODE_STORAGE_KEY];
  }
  await chrome.storage.sync.set({ [CITATION_MODE_STORAGE_KEY]: DEFAULT_CITATION_MODE });
  return DEFAULT_CITATION_MODE;
}

function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: COPY_SELECTION_MENU_ID,
      title: 'Copy selection as Markdown',
      contexts: ['selection'],
      visible: false,
    });

    chrome.contextMenus.create({
      id: OPEN_CITATION_MODE_MENU_ID,
      title: '출처 복사 모드 설정',
      contexts: ['page', 'selection', 'editable'],
      documentUrlPatterns: GEMINI_URL_PATTERNS,
    });
  });
}

async function initCitationModeUi(): Promise<void> {
  const mode = await ensureDefaultCitationMode();
  await applyCitationModeToAction(mode);
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
  void initCitationModeUi();
});

chrome.runtime.onStartup.addListener(() => {
  void initCitationModeUi();
});

void initCitationModeUi();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  const change = changes[CITATION_MODE_STORAGE_KEY];
  if (!change || !isCitationMode(change.newValue)) return;
  void applyCitationModeToAction(change.newValue);
});

chrome.runtime.onMessage.addListener(
  (msg: { selectionReadable?: boolean }, sender: chrome.runtime.MessageSender) => {
    if (msg.selectionReadable === undefined || !sender.tab?.id) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id !== sender.tab?.id) return;
      chrome.contextMenus.update(COPY_SELECTION_MENU_ID, { visible: msg.selectionReadable });
    });
  }
);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === OPEN_CITATION_MODE_MENU_ID) {
    const openOptions = tab?.windowId != null ? { windowId: tab.windowId } : undefined;
    void chrome.action.openPopup(openOptions).catch((err: unknown) => {
      console.warn('[MD_COPY] openPopup failed', err);
    });
    return;
  }

  if (info.menuItemId !== COPY_SELECTION_MENU_ID || !tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { action: 'copySelectionAsMarkdown' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[MD_COPY]', chrome.runtime.lastError.message);
      return;
    }
    if (response?.success) {
      // Visual feedback is handled in the content script when needed.
    }
  });
});
