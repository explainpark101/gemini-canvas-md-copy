/**
 * Context menu 클릭 시 선택 영역 HTML을 Markdown으로 변환하여 클립보드에 복사
 */
import { htmlToMarkdown } from './html-to-markdown.ts';

/** 선택 영역 HTML을 읽을 수 있는지 검사 (canvas, shadow DOM 등 비읽기 영역 제외) */
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

function notifySelectionReadable(readable: boolean): void {
  chrome.runtime.sendMessage({ selectionReadable: readable });
}

let selectionDebounceTimer: ReturnType<typeof setTimeout>;
function onSelectionChange(): void {
  clearTimeout(selectionDebounceTimer);
  selectionDebounceTimer = setTimeout(() => {
    notifySelectionReadable(isSelectionReadable());
  }, 50);
}

document.addEventListener('selectionchange', onSelectionChange, { passive: true });
onSelectionChange();

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

        // 선택 영역의 마지막 엘리먼트가 눈에 보이는 텍스트를 가지지 않는 경우 제거
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

        const markdown = htmlToMarkdown(html);
        await navigator.clipboard.writeText(markdown);
        showCopyFeedback();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
    })();

    return true; // 비동기 sendResponse를 위해 true 반환
  }
);
