let extensionInvalidated = false;
let selectionDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let selectionChangeHandler: (() => void) | undefined;

export function isExtensionContextValid(): boolean {
  if (extensionInvalidated) return false;
  try {
    void chrome.runtime.id;
    return true;
  } catch {
    extensionInvalidated = true;
    return false;
  }
}

function teardownSelectionWatcher(): void {
  if (selectionChangeHandler) {
    document.removeEventListener('selectionchange', selectionChangeHandler);
    selectionChangeHandler = undefined;
  }
  if (selectionDebounceTimer !== undefined) {
    clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = undefined;
  }
}

function markExtensionInvalidated(): void {
  extensionInvalidated = true;
  teardownSelectionWatcher();
}

function isBenignRuntimeError(message: string | undefined): boolean {
  if (!message) return false;
  return /invalidated|establish connection|receiving end does not exist/i.test(message);
}

/** selectionReadable 메시지 전송 (context invalidated·SW 미준비 시 콘솔 오류 방지) */
export function notifySelectionReadable(readable: boolean): void {
  if (!isExtensionContextValid()) {
    teardownSelectionWatcher();
    return;
  }

  try {
    chrome.runtime.sendMessage({ selectionReadable: readable }, () => {
      const err = chrome.runtime.lastError;
      if (err && isBenignRuntimeError(err.message)) {
        markExtensionInvalidated();
      }
    });
  } catch {
    markExtensionInvalidated();
  }
}

/** selectionchange 감시 시작 — 확장 무효화 시 리스너 자동 해제 */
export function startSelectionReadableWatcher(isReadable: () => boolean): void {
  selectionChangeHandler = () => {
    if (!isExtensionContextValid()) {
      teardownSelectionWatcher();
      return;
    }

    clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
      notifySelectionReadable(isReadable());
    }, 50);
  };

  document.addEventListener('selectionchange', selectionChangeHandler, { passive: true });
  notifySelectionReadable(isReadable());
}
