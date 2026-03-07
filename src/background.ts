/**
 * Context menu 등록 및 클릭 핸들러
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'copySelectionAsMarkdown',
    title: 'Copy selection as Markdown',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'copySelectionAsMarkdown' || !tab?.id) return;

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
