(function() {
    'use strict';

    // 타겟 셀렉터 정의
    const TARGET_SELECTOR = ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';

    // Trusted Types 정책 설정 (보안 정책 우회용)
    let trustedPolicy;
    if (typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy) {
        try {
            trustedPolicy = trustedTypes.createPolicy('markdown-copy-policy', {
                createHTML: (string) => string
            });
        } catch (e) {
            trustedPolicy = { createHTML: (string) => string };
        }
    } else {
        trustedPolicy = { createHTML: (string) => string };
    }

    // 1. 문자열을 파싱하여 DOM 객체의 body 반환
    function parseHTML(htmlString) {
        const parser = new DOMParser();
        const safeHTML = trustedPolicy.createHTML(htmlString);
        const doc = parser.parseFromString(safeHTML, 'text/html');
        return doc.body;
    }

    function convertNodes(node, indent) {
        let markdown = '';
        const children = Array.from(node.childNodes);
      
        children.forEach((child) => {
          if (child.nodeType === 3) {
            const text = child.textContent;
            markdown += text.replace(/\s+/g, ' ');
          } else if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
      
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
              case 'p':
                markdown += `\n${convertNodes(child, '')}\n`;
                break;
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
              case 'sup':
                markdown += `<sup>${convertNodes(child, '')}</sup>`;
                break;
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
                const title = (child.getAttribute('title') || '').replace(/"/g, '&quot;');
                markdown += title ? `<abbr title="${title}">${convertNodes(child, '')}</abbr>` : convertNodes(child, '');
                break;
              }
              case 'input':
                break;
              case 'strong':
              case 'b':
                markdown += `**${convertNodes(child, '')}**`;
                break;
              case 'em':
              case 'i':
                markdown += `*${convertNodes(child, '')}*`;
                break;
              case 'code':
                if (child.parentNode.tagName.toLowerCase() === 'pre') {
                  markdown += convertNodes(child, '');
                } else {
                  markdown += ` \`${convertNodes(child, '')}\` `;
                }
                break;
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
                const checkbox = child.querySelector('input[type="checkbox"]');
                if (checkbox) {
                  const checkPrefix = checkbox.checked ? '[x] ' : '[ ] ';
                  const clone = child.cloneNode(true);
                  clone.querySelector('input[type="checkbox"]')?.remove();
                  const content = convertNodes(clone, indent + '  ').trim();
                  markdown += `${indent}- ${checkPrefix}${content}\n`;
                } else {
                  const prefix = child.parentNode.tagName.toLowerCase() === 'ol' ? '1. ' : '- ';
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
                markdown += `[${convertNodes(child, '')}](${child.getAttribute('href') || ''})`;
                break;
              case 'img':
                markdown += `![${child.getAttribute('alt') || ''}](${child.getAttribute('src') || ''})`;
                break;
              case 'table':
                markdown += `\n\n${processTable(child)}\n`;
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
                const summary = child.querySelector('summary');
                const summaryText = summary ? convertNodes(summary, '') : 'Details';
                const content = Array.from(child.childNodes)
                  .filter((n) => n !== summary)
                  .map((n) => (n.nodeType === 1 ? convertNodes(n, indent) : n.textContent))
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
              default:
                markdown += convertNodes(child, indent);
            }
          }
        });
      
        return markdown;
    }

    function processTable(table) {
        const rows = [];
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody') || table;
        const trs = [...(thead ? thead.querySelectorAll('tr') : []), ...tbody.querySelectorAll('tr')];

        trs.forEach((tr) => {
            const cells = [];
            tr.querySelectorAll('th, td').forEach((cell) => {
                cells.push(convertNodes(cell, '').trim().replace(/\n/g, ' '));
            });
            if (cells.length) rows.push(cells);
        });

        if (rows.length === 0) return '';

        const colCount = Math.max(...rows.map((r) => r.length));
        const pad = (arr) => {
            const a = [...arr];
            while (a.length < colCount) a.push('');
            return a;
        };

        const toRow = (arr) => '| ' + pad(arr).join(' | ') + ' |';
        const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';

        let md = '\n' + toRow(rows[0]) + '\n' + sep;
        for (let i = 1; i < rows.length; i++) {
            md += '\n' + toRow(rows[i]);
        }
        return md + '\n';
    }

    // 3. 스타일 주입 (GM_addStyle 대체)
    const style = document.createElement('style');
    style.textContent = `
        #custom-floating-copy-btn {
            position: fixed;
            z-index: 999999;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            touch-action: none;
            display: none;
            opacity: 0;
            transform: scale(0.5);
            pointer-events: none;
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: hidden;
        }
        #custom-floating-copy-btn.visible {
            opacity: 1;
            transform: scale(1);
            pointer-events: auto;
        }
        #custom-floating-copy-btn.visible:active {
            transform: scale(0.95);
            transition: transform 0.1s;
        }
        #custom-floating-copy-btn button {
            padding: 10px 20px;
            background: transparent;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            outline: none;
        }
        #custom-floating-copy-btn button:hover {
            background-color: rgba(255,255,255,0.15);
        }
    `;
    document.head.appendChild(style);

    // 4. 버튼 요소 생성
    const btn = document.createElement('div');
    btn.id = 'custom-floating-copy-btn';

    const copyBtn = document.createElement('button');
    copyBtn.innerText = 'Copy Markdown';

    btn.appendChild(copyBtn);

    // 5. 로컬 스토리지에서 초기 위치 불러오기
    const savedX = localStorage.getItem('floatingBtnX') || '5vw';
    const savedY = localStorage.getItem('floatingBtnY') || '90vh';
    btn.style.left = savedX;
    btn.style.top = savedY;
    document.body.appendChild(btn);

    // 6. 드래그 및 클릭 로직
    let isDragging = false;
    let isLongPress = false;
    let longPressTimer;
    let startX, startY;
    let initialLeft, initialTop;
    let isButtonActive = false;
    let clickTarget = null;

    btn.addEventListener('pointerdown', (e) => {
        if (!isButtonActive) return;

        isDragging = false;
        isLongPress = false;
        startX = e.clientX;
        startY = e.clientY;
        clickTarget = e.target.closest('button');

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

    btn.addEventListener('pointermove', (e) => {
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

    btn.addEventListener('pointerup', (e) => {
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

    // 7. 복사 함수 (GM_setClipboard → navigator.clipboard.writeText)
    async function copyContent() {
        const target = document.querySelector(TARGET_SELECTOR);
        if (target) {
            const domBody = parseHTML(target.innerHTML);
            const markdownResult = convertNodes(domBody, '').trim();
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

    // 8. 시각적 피드백
    function showFeedback(msg, btnElement = copyBtn) {
        const originalText = btnElement.innerText;
        btnElement.innerText = msg;
        setTimeout(() => {
            btnElement.innerText = originalText;
        }, 1500);
    }

    // 9. Observer를 통한 동적 표시 및 애니메이션 로직
    let hideTimeout;
    function toggleButtonVisibility() {
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
