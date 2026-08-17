import { htmlToMarkdown } from './html-to-markdown.ts';
import {
    CITATION_MODE_LABELS,
    CITATION_MODE_STORAGE_KEY,
    CITATION_MODES,
    getStoredCitationMode,
    isCitationMode,
    type CitationMode,
} from './citation-mode.ts';

(function () {
    'use strict';

    const TARGET_SELECTOR =
        ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';

    const btn = document.createElement('div');
    btn.id = 'custom-floating-copy-btn';

    const main = document.createElement('div');
    main.className = 'fab-main';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'fab-copy';
    copyBtn.innerText = 'Copy Markdown';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'fab-menu-toggle';
    menuBtn.setAttribute('aria-label', '출처 복사 모드 변경');
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML =
        '<svg class="fab-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'fab-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    for (const mode of CITATION_MODES) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'fab-menu-item';
        item.setAttribute('role', 'menuitemradio');
        item.dataset.mode = mode;
        item.textContent = CITATION_MODE_LABELS[mode];
        menu.appendChild(item);
    }

    main.appendChild(copyBtn);
    main.appendChild(menuBtn);
    btn.appendChild(main);
    btn.appendChild(menu);

    const savedX = localStorage.getItem('floatingBtnX') || '5vw';
    const savedY = localStorage.getItem('floatingBtnY') || '90vh';
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
    let menuOpen = false;

    function updateMenuPlacement(): void {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const openDown = centerY < window.innerHeight * 0.5;
        const openRight = centerX < window.innerWidth * 0.5;

        btn.classList.toggle('menu-down', openDown);
        btn.classList.toggle('menu-up', !openDown);
        btn.classList.toggle('menu-right', openRight);
        btn.classList.toggle('menu-left', !openRight);
    }

    function setMenuOpen(open: boolean): void {
        menuOpen = open;
        if (open) {
            updateMenuPlacement();
        }
        menu.hidden = !open;
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('menu-open', open);
    }

    function syncMenuSelection(mode: CitationMode): void {
        for (const item of menu.querySelectorAll<HTMLButtonElement>('.fab-menu-item')) {
            const selected = item.dataset.mode === mode;
            item.classList.toggle('is-selected', selected);
            item.setAttribute('aria-checked', selected ? 'true' : 'false');
        }
        menuBtn.title = `출처 복사: ${CITATION_MODE_LABELS[mode]}`;
        copyBtn.title = `Copy Markdown (${CITATION_MODE_LABELS[mode]})`;
    }

    async function loadCitationMode(): Promise<void> {
        const mode = await getStoredCitationMode();
        syncMenuSelection(mode);
    }

    async function saveCitationMode(mode: CitationMode): Promise<void> {
        await chrome.storage.sync.set({ [CITATION_MODE_STORAGE_KEY]: mode });
        syncMenuSelection(mode);
        setMenuOpen(false);
        showFeedback(CITATION_MODE_LABELS[mode], copyBtn);
    }

    void loadCitationMode();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        const change = changes[CITATION_MODE_STORAGE_KEY];
        if (!change || !isCitationMode(change.newValue)) return;
        syncMenuSelection(change.newValue);
    });

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
            setMenuOpen(false);
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
            if (clickTarget === menuBtn || menuBtn.contains(clickTarget)) {
                setMenuOpen(!menuOpen);
            } else if (clickTarget === copyBtn || copyBtn.contains(clickTarget)) {
                setMenuOpen(false);
                void copyContent();
            } else if (clickTarget.classList.contains('fab-menu-item')) {
                const mode = clickTarget.dataset.mode;
                if (isCitationMode(mode)) {
                    void saveCitationMode(mode);
                }
            }
        }

        isDragging = false;
        isLongPress = false;
        clickTarget = null;
    });

    document.addEventListener(
        'pointerdown',
        (e: PointerEvent) => {
            if (!menuOpen) return;
            if (btn.contains(e.target as Node)) return;
            setMenuOpen(false);
        },
        true,
    );

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && menuOpen) {
            setMenuOpen(false);
        }
    });

    window.addEventListener('resize', () => {
        if (menuOpen) {
            updateMenuPlacement();
        }
    });

    async function copyContent(): Promise<void> {
        const target = document.querySelector(TARGET_SELECTOR);
        if (target) {
            const citationMode = await getStoredCitationMode();
            const needsSources =
                citationMode === 'footnote' ||
                citationMode === 'linkFootnote' ||
                citationMode === 'link';
            if (needsSources) {
                const responseContainer = document.querySelector('.response-container-content');
                const sourceLists = responseContainer?.querySelector('deep-research-source-lists');
                console.log('[MD_COPY][citation] canvas containers', {
                    citationMode,
                    hasResponseContainer: Boolean(responseContainer),
                    hasStructuredContent: Boolean(
                        responseContainer?.querySelector('structured-content-container'),
                    ),
                    hasDeepResearchSourceLists: Boolean(sourceLists),
                    deepResearchSourceListsHtmlPreview: sourceLists
                        ? sourceLists.outerHTML.slice(0, 500)
                        : null,
                });
            }
            const markdownResult = htmlToMarkdown(target.innerHTML, {
                citationMode,
                sourcesRoot: needsSources ? document : null,
            });
            if (needsSources) {
                console.log('[MD_COPY][citation] markdown result', {
                    citationMode,
                    length: markdownResult.length,
                    tail: markdownResult.slice(-800),
                });
            }
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
            console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas found, showing button');
            void btn.offsetWidth;
            btn.classList.add('visible');
        } else if (!targetExists && isButtonActive) {
            console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas not found, hiding button');
            isButtonActive = false;
            setMenuOpen(false);
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
