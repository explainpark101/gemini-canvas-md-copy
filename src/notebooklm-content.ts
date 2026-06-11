import { notebooklmHtmlToMarkdown } from './notebooklm-html-to-markdown.ts';

(function () {
  'use strict';

  const TARGET_SELECTOR = 'report-viewer';
  const STORAGE_KEY_X = 'notebooklmFloatingBtnX';
  const STORAGE_KEY_Y = 'notebooklmFloatingBtnY';
  const LOG_PREFIX = '[NOTEBOOKLM_MD_COPY]';

  const btn = document.createElement('div');
  btn.id = 'custom-floating-copy-btn';

  const copyBtn = document.createElement('button');
  copyBtn.innerText = 'Copy Markdown';

  btn.appendChild(copyBtn);

  const savedX = localStorage.getItem(STORAGE_KEY_X) || '5vw';
  const savedY = localStorage.getItem(STORAGE_KEY_Y) || '90vh';
  btn.style.left = savedX;
  btn.style.top = savedY;
  document.body.appendChild(btn);

  let isDragging = false;
  let isLongPress = false;
  let longPressTimer: ReturnType<typeof setTimeout>;
  let startX: number, startY: number;
  let initialLeft: number, initialTop: number;
  let isButtonActive = false;
  let clickTarget: Element | null = null;

  btn.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!isButtonActive) return;

    isDragging = false;
    isLongPress = false;
    startX = e.clientX;
    startY = e.clientY;
    clickTarget = (e.target as Element).closest('button');

    const rect = btn.getBoundingClientRect();
    initialLeft = e.clientX - rect.left;
    initialTop = e.clientY - rect.top;

    longPressTimer = setTimeout(() => {
      if (!isButtonActive) return;
      isLongPress = true;
      btn.style.opacity = '0.8';
      btn.style.cursor = 'grabbing';
    }, 300);

    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isButtonActive) return;

    if (!isLongPress) {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        clearTimeout(longPressTimer);
      }
      return;
    }

    isDragging = true;

    const newX = e.clientX - initialLeft;
    const newY = e.clientY - initialTop;

    const vw = (newX / window.innerWidth) * 100;
    const vh = (newY / window.innerHeight) * 100;

    btn.style.left = `${vw}vw`;
    btn.style.top = `${vh}vh`;
  });

  btn.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isButtonActive) return;

    clearTimeout(longPressTimer);
    btn.releasePointerCapture(e.pointerId);
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';

    if (isDragging) {
      localStorage.setItem(STORAGE_KEY_X, btn.style.left);
      localStorage.setItem(STORAGE_KEY_Y, btn.style.top);
    } else if (!isLongPress && clickTarget) {
      void copyContent();
    }

    isDragging = false;
    isLongPress = false;
    clickTarget = null;
  });

  async function copyContent(): Promise<void> {
    const target = document.querySelector(TARGET_SELECTOR);
    if (target) {
      const markdownResult = notebooklmHtmlToMarkdown(target.innerHTML);
      try {
        await navigator.clipboard.writeText(markdownResult);
        showFeedback('Copied!', copyBtn);
      } catch {
        showFeedback('Failed', copyBtn);
      }
    } else {
      showFeedback('Not Found', copyBtn);
    }
  }

  function showFeedback(msg: string, btnElement: HTMLButtonElement = copyBtn): void {
    const originalText = btnElement.innerText;
    btnElement.innerText = msg;
    setTimeout(() => {
      btnElement.innerText = originalText;
    }, 1500);
  }

  let hideTimeout: ReturnType<typeof setTimeout>;
  function toggleButtonVisibility(): void {
    const targetExists = document.querySelector(TARGET_SELECTOR) !== null;

    if (targetExists && !isButtonActive) {
      isButtonActive = true;
      clearTimeout(hideTimeout);
      btn.style.display = 'flex';
      console.debug(`${LOG_PREFIX} report-viewer found, showing button`);
      void btn.offsetWidth;
      btn.classList.add('visible');
    } else if (!targetExists && isButtonActive) {
      console.debug(`${LOG_PREFIX} report-viewer not found, hiding button`);
      isButtonActive = false;
      btn.classList.remove('visible');

      hideTimeout = setTimeout(() => {
        if (!isButtonActive) {
          btn.style.display = 'none';
        }
      }, 400);
    }
  }

  toggleButtonVisibility();

  const observer = new MutationObserver(() => {
    toggleButtonVisibility();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
