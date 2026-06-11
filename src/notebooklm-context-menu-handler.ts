/**
 * NotebookLM: context menu 클릭 시 선택 영역 HTML을 Markdown으로 변환하여 클립보드에 복사
 */
import { notebooklmHtmlToMarkdown } from './notebooklm-html-to-markdown.ts';
import {
  isExtensionContextValid,
  startSelectionReadableWatcher,
} from './notify-selection-readable.ts';

function isSelectionReadable(): boolean {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const html = container.innerHTML;
    return html.trim().length > 0;
  } catch {
    return false;
  }
}

startSelectionReadableWatcher(isSelectionReadable);

function showCopyFeedback(): void {
  const toast = document.createElement('div');
  toast.textContent = 'Copied as Markdown!';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    background: '#333',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '2147483647',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

chrome.runtime.onMessage.addListener(
  (
    msg: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { success: boolean; error?: string }) => void
  ) => {
    if (!isExtensionContextValid()) {
      return false;
    }

    if (msg.action !== 'copySelectionAsMarkdown') {
      sendResponse({ success: false });
      return true;
    }

    (async () => {
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          sendResponse({ success: false, error: 'no_selection' });
          return;
        }

        const range = selection.getRangeAt(0);
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());

        let lastEl = container.lastElementChild;
        while (lastEl && (lastEl.textContent ?? '').trim() === '') {
          const prev = lastEl.previousElementSibling;
          lastEl.remove();
          lastEl = prev;
        }

        const html = container.innerHTML;
        if (!html.trim()) {
          sendResponse({ success: false, error: 'empty_selection' });
          return;
        }

        const markdown = notebooklmHtmlToMarkdown(html);
        await navigator.clipboard.writeText(markdown);
        showCopyFeedback();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
    })();

    return true;
  }
);
