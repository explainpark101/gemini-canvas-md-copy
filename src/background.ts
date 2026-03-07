/**
 * Context menu 등록 및 클릭 핸들러
 */

const MENU_ID = 'copySelectionAsMarkdown';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Copy selection as Markdown',
    contexts: ['selection'],
    visible: false,
  });
});

chrome.runtime.onMessage.addListener(
  (msg: { selectionReadable?: boolean }, sender: chrome.runtime.MessageSender) => {
    if (msg.selectionReadable === undefined || !sender.tab?.id) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id !== sender.tab?.id) return;
      chrome.contextMenus.update(MENU_ID, { visible: msg.selectionReadable });
    });
  }
);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { action: 'copySelectionAsMarkdown' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[GEMINI_CANVAS_MD_COPY]', chrome.runtime.lastError.message);
      return;
    }
    if (response?.success) {
      // 성공 시 시각적 피드백은 content script에서 처리 가능
    }
  });
});
