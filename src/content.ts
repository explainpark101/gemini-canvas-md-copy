import { htmlToMarkdown } from './html-to-markdown.ts';

(function() {
    'use strict';

    // 타겟 셀렉터 정의
    const TARGET_SELECTOR = ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';

    // 3. 버튼 요소 생성
    const btn = document.createElement('div');
    btn.id = 'custom-floating-copy-btn';

    const copyBtn = document.createElement('button');
    copyBtn.innerText = 'Copy Markdown';

    btn.appendChild(copyBtn);

    // 4. 로컬 스토리지에서 초기 위치 불러오기
    const savedX = localStorage.getItem('floatingBtnX') || '5vw';
    const savedY = localStorage.getItem('floatingBtnY') || '90vh';
    btn.style.left = savedX;
    btn.style.top = savedY;
    document.body.appendChild(btn);

    // 5. 드래그 및 클릭 로직
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

        let newX = e.clientX - initialLeft;
        let newY = e.clientY - initialTop;

        let vw = (newX / window.innerWidth) * 100;
        let vh = (newY / window.innerHeight) * 100;

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
            localStorage.setItem('floatingBtnX', btn.style.left);
            localStorage.setItem('floatingBtnY', btn.style.top);
        } else if (!isLongPress && clickTarget) {
            copyContent();
        }

        isDragging = false;
        isLongPress = false;
        clickTarget = null;
    });

    // 6. 복사 함수 (GM_setClipboard → navigator.clipboard.writeText)
    async function copyContent(): Promise<void> {
        const target = document.querySelector(TARGET_SELECTOR);
        if (target) {
            const markdownResult = htmlToMarkdown(target.innerHTML);
            try {
                await navigator.clipboard.writeText(markdownResult);
                showFeedback('Copied!', copyBtn);
            } catch (err) {
                showFeedback('Failed', copyBtn);
            }
        } else {
            showFeedback('Not Found', copyBtn);
        }
    }

    // 7. 시각적 피드백
    function showFeedback(msg: string, btnElement: HTMLButtonElement = copyBtn): void {
        const originalText = btnElement.innerText;
        btnElement.innerText = msg;
        // alert(`[GEMINI_CANVAS_MARKDOWN_COPY] ${msg}`);
        setTimeout(() => {
            btnElement.innerText = originalText;
        }, 1500);
    }

    // 8. Observer를 통한 동적 표시 및 애니메이션 로직
    let hideTimeout: ReturnType<typeof setTimeout>;
    function toggleButtonVisibility(): void {
        const targetExists = document.querySelector(TARGET_SELECTOR) !== null;

        if (targetExists && !isButtonActive) {
            isButtonActive = true;
            clearTimeout(hideTimeout);
            btn.style.display = 'flex';
            console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas found, showing button');
            void btn.offsetWidth;
            btn.classList.add('visible');
        } else if (!targetExists && isButtonActive) {
            console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas not found, hiding button');
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
        subtree: true
    });

})();
