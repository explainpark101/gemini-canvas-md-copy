(function() {
    'use strict';

    // 타겟 셀렉터 정의
    const TARGET_SELECTOR = ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';

    // Trusted Types 정책 설정 (보안 정책 우회용)
    let trustedPolicy: { createHTML: (s: string) => string };
    const tt = (globalThis as { trustedTypes?: { createPolicy: (n: string, o: object) => unknown } }).trustedTypes;
    if (tt?.createPolicy) {
        try {
            trustedPolicy = tt.createPolicy('markdown-copy-policy', {
                createHTML: (s: string) => s
            }) as { createHTML: (s: string) => string };
        } catch {
            trustedPolicy = { createHTML: (s: string) => s };
        }
    } else {
        trustedPolicy = { createHTML: (s: string) => s };
    }

    // 1. 문자열을 파싱하여 DOM 객체의 body 반환
    function parseHTML(htmlString: string): HTMLElement {
        const parser = new DOMParser();
        const safeHTML = trustedPolicy.createHTML(htmlString);
        const doc = parser.parseFromString(safeHTML, 'text/html');
        return doc.body;
    }

    function convertNodes(node: Node, indent: string): string {
      const children = Array.from(node.childNodes);
        let markdown = '';

        children.forEach((child) => {
          if (child.nodeType === 3) {
            const text = child.textContent ?? '';
            markdown += text.replace(/\s+/g, ' ');
          } else if (child.nodeType === 1) {
            const el = child as Element;
            if (el.classList?.contains('export-sheets-button-container')) {
              return;
            }
            const tag = el.tagName.toLowerCase();

            switch (tag) {
              case 'h1':
                markdown += `\n# ${convertNodes(child, '')}\n`;
                break;
              case 'h2':
                markdown += `\n## ${convertNodes(child, '')}\n`;
                break;
              case 'h3':
                markdown += `\n### ${convertNodes(child, '')}\n`;
                break;
              case 'h4':
                markdown += `\n#### ${convertNodes(child, '')}\n`;
                break;
              case 'h5':
                markdown += `\n##### ${convertNodes(child, '')}\n`;
                break;
              case 'h6':
                markdown += `\n###### ${convertNodes(child, '')}\n`;
                break;
              case 'p': {
                const pContent = convertNodes(child, '');
                const parent = el.parentNode as Element | null;
                const isLiFirstChildP = parent?.tagName?.toLowerCase() === 'li' && parent?.firstElementChild === el;
                const isFirstChildStrong = el.firstElementChild?.tagName?.toLowerCase() === 'strong';
                if (isLiFirstChildP && isFirstChildStrong) {
                  markdown += pContent.trimStart();
                } else {
                  markdown += `\n${pContent}\n`;
                }
                break;
              }
              case 'br':
                markdown += '\n';
                break;
              case 'hr':
                markdown += '\n---\n';
                break;
              case 'del':
              case 's':
              case 'strike':
                markdown += `~~${convertNodes(child, '')}~~`;
                break;
              case 'mark':
                markdown += `==${convertNodes(child, '')}==`;
                break;
              case 'sub':
                markdown += `<sub>${convertNodes(child, '')}</sub>`;
                break;
              case 'sup': {
                const supContent = convertNodes(child, '');
                if (supContent.trim()) {
                  markdown += `<sup>${supContent}</sup>`;
                }
                break;
              }
              case 'u':
                markdown += `<u>${convertNodes(child, '')}</u>`;
                break;
              case 'ins':
                markdown += `<ins>${convertNodes(child, '')}</ins>`;
                break;
              case 'kbd':
                markdown += `<kbd>${convertNodes(child, '')}</kbd>`;
                break;
              case 'small':
                markdown += `<small>${convertNodes(child, '')}</small>`;
                break;
              case 'abbr': {
                const title = (el.getAttribute('title') || '').replace(/"/g, '&quot;');
                markdown += title ? `<abbr title="${title}">${convertNodes(child, '')}</abbr>` : convertNodes(child, '');
                break;
              }
              case 'input':
                break;
              case 'strong':
              case 'b': {
                let strongContent = convertNodes(child, '');
                markdown += `**${strongContent.trim()}**`;
                break;
              }
              case 'em':
              case 'i':
                markdown += `*${convertNodes(child, '')}*`;
                break;
              case 'code': {
                const codeText = (el.textContent ?? '').replace(/\\n/g, '\n');
                if ((el.parentNode as Element)?.tagName?.toLowerCase() === 'pre') {
                  markdown += codeText;
                } else {
                  markdown += ` \`${codeText}\` `;
                }
                break;
              }
              case 'pre':
                markdown += `\n\`\`\`\n${convertNodes(child, '')}\n\`\`\`\n`;
                break;
              case 'blockquote':
                markdown += `\n> ${convertNodes(child, '').trim().replace(/\n/g, '\n> ')}\n`;
                break;
              case 'ul':
              case 'ol':
                markdown += `\n${convertNodes(child, indent)}\n`;
                break;
              case 'li': {
                const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                if (checkbox) {
                  const checkPrefix = checkbox.checked ? '[x] ' : '[ ] ';
                  const clone = el.cloneNode(true) as Element;
                  clone.querySelector('input[type="checkbox"]')?.remove();
                  const content = convertNodes(clone, indent + '  ').trim();
                  markdown += `${indent}- ${checkPrefix}${content}\n`;
                } else {
                  const prefix = (el.parentNode as Element)?.tagName?.toLowerCase() === 'ol' ? '1. ' : '- ';
                  markdown += `${indent}${prefix}${convertNodes(child, indent + '  ')}\n`;
                }
                break;
              }
              case 'dl':
                markdown += `\n${convertNodes(child, indent)}\n`;
                break;
              case 'dt':
                markdown += `\n${indent}${convertNodes(child, '')}\n`;
                break;
              case 'dd':
                markdown += `${indent}:   ${convertNodes(child, '').trim().replace(/\n/g, '\n    ')}\n`;
                break;
              case 'a':
                markdown += `[${convertNodes(child, '')}](${el.getAttribute('href') || ''})`;
                break;
              case 'img':
                markdown += `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`;
                break;
              case 'table':
                markdown += `\n\n${processTable(el)}\n`;
                break;
              case 'div':
                markdown += `\n${convertNodes(child, indent)}\n`;
                break;
              case 'span':
                markdown += convertNodes(child, indent);
                break;
              case 'q':
                markdown += `"${convertNodes(child, '')}"`;
                break;
              case 'cite':
                markdown += `*${convertNodes(child, '')}*`;
                break;
              case 'samp':
              case 'var':
                markdown += `\`${convertNodes(child, '')}\``;
                break;
              case 'details': {
                const summary = el.querySelector('summary');
                const summaryText = summary ? convertNodes(summary, '') : 'Details';
                const content = Array.from(el.childNodes)
                  .filter((n) => n !== summary)
                  .map((n) => (n.nodeType === 1 ? convertNodes(n, indent) : (n.textContent ?? '')))
                  .join('');
                markdown += `\n<details>\n<summary>${summaryText}</summary>\n\n${content.trim()}\n</details>\n`;
                break;
              }
              case 'summary':
                markdown += convertNodes(child, indent);
                break;
              case 'figure':
                markdown += `\n${convertNodes(child, indent)}\n`;
                break;
              case 'figcaption':
                markdown += `\n*${convertNodes(child, '').trim()}*\n`;
                break;
              case 'nav':
              case 'header':
              case 'footer':
              case 'section':
              case 'article':
              case 'main':
              case 'aside':
                markdown += `\n${convertNodes(child, indent)}\n`;
                break;
              case 'math-inline': {
                const inlineLatex = el.getAttribute('data-math') || '';
                if (inlineLatex.trim()) {
                  markdown += `$${inlineLatex}$`;
                }
                break;
              }
              case 'math-block':
              case 'math-display': {
                const blockLatex = el.getAttribute('data-math') || '';
                if (blockLatex.trim()) {
                  markdown += `\n$$\n${blockLatex}\n$$\n`;
                }
                break;
              }
              default:
                markdown += convertNodes(child, indent);
            }
          }
        });

        return markdown;
    }

    function processTable(table: Element): string {
        const rows: string[][] = [];
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody') || table;
        const trs = [
            ...(thead ? Array.from(thead.querySelectorAll('tr')) : []),
            ...Array.from(tbody.querySelectorAll('tr')),
        ];

        trs.forEach((tr) => {
            const cells: string[] = [];
            tr.querySelectorAll('th, td').forEach((cell: Element) => {
                cells.push(convertNodes(cell, '').trim().replace(/\n/g, ' '));
            });
            if (cells.length) rows.push(cells);
        });

        if (rows.length === 0) return '';

        const colCount = Math.max(...rows.map((r) => r.length));
        const pad = (arr: string[]) => {
            const a = [...arr];
            while (a.length < colCount) a.push('');
            return a;
        };

        const toRow = (arr: string[]) => '| ' + pad(arr).join(' | ') + ' |';
        const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';

        const firstRow = rows[0]!;
        let md = '\n' + toRow(firstRow) + '\n' + sep;
        for (let i = 1; i < rows.length; i++) {
            md += '\n' + toRow(rows[i]!);
        }
        return md + '\n';
    }

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

    // 연속된 빈 줄(3개 이상)을 하나의 빈 줄로 정리. \r\n, \r, 공백만 있는 줄 포함
    function normalizeWhitespace(md: string): string {
        const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return normalized.replace(/(\n[\t ]*){3,}/g, '\n\n');
    }

    // **bold** 뒤에 글자가 바로 붙으면 공백 삽입 (마크다운 파싱 버그 방지)
    // stack으로 여는 ** / 닫는 ** 구분하여, 닫는 ** 직후에만 공백 삽입
    function ensureSpaceAfterBold(md: string): string {
        let result = '';
        let i = 0;
        let boldDepth = 0; // 0: 밖, 1: bold 안

        while (i < md.length) {
            if (i + 1 < md.length && md[i] === '*' && md[i + 1] === '*' && (i === 0 || md[i - 1] !== '\\')) {
                if (boldDepth === 0) {
                    boldDepth = 1; // 여는 **
                    result += '**';
                    i += 2;
                } else {
                    boldDepth = 0; // 닫는 **
                    result += '**';
                    i += 2;
                    if (i < md.length && /[가-힣a-zA-Z0-9]/.test(md[i] ?? '')) {
                        result += ' ';
                    }
                }
            } else {
                result += md[i] ?? '';
                i++;
            }
        }
        return result;
    }

    // ** 와 bold 내용 사이의 공백 제거 (예: ** Any** -> **Any**)
    function trimBoldContent(md: string): string {
        return md.replace(/\*\* +([^*]+?)\*\*/g, '**$1**');
    }

    // 2칸 이상 연속 공백을 1칸으로
    function collapseSpaces(md: string): string {
        return md.replace(/[ \t]{2,}/g, ' ');
    }

    // 6. 복사 함수 (GM_setClipboard → navigator.clipboard.writeText)
    async function copyContent(): Promise<void> {
        const target = document.querySelector(TARGET_SELECTOR);
        if (target) {
            const domBody = parseHTML(target.innerHTML);
            let markdownResult = convertNodes(domBody, '').trim();
            markdownResult = normalizeWhitespace(markdownResult);
            markdownResult = trimBoldContent(markdownResult);
            markdownResult = collapseSpaces(markdownResult);
            markdownResult = ensureSpaceAfterBold(markdownResult);
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
            void btn.offsetWidth;
            btn.classList.add('visible');
        } else if (!targetExists && isButtonActive) {
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
