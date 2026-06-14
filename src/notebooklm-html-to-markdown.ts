/**
 * NotebookLM report-viewer HTML → Markdown (Gemini htmlToMarkdown과 별도)
 */

/** 마크다운에 포함하지 않을 NotebookLM UI (인용 각주 버튼 등) */
const SKIP_ELEMENT_SELECTOR = 'button.citation-marker';

function shouldSkipNotebooklmElement(el: Element): boolean {
  return el.matches(SKIP_ELEMENT_SELECTOR);
}

export function notebooklmHtmlToMarkdown(htmlString: string): string {
  if (!htmlString) return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    doc.body.querySelectorAll(SKIP_ELEMENT_SELECTOR).forEach((el) => {
      el.remove();
    });

    const walk = (node: Node, depth = 0): string => {
      if (node.nodeType === 3) {
        return (node.textContent ?? '').replace(/\s+/g, ' ');
      }

      if (node.nodeType !== 1) return '';

      const el = node as Element;
      if (shouldSkipNotebooklmElement(el)) return '';

      const tag = el.tagName.toLowerCase();
      const classes = typeof el.className === 'string' ? el.className : '';

      if (tag === 'table') {
        let tableMd = '\n\n';
        const rows = el.querySelectorAll('tr');
        rows.forEach((row) => {
          let rowMd = '|';
          let colCount = 0;
          let isHeader = false;
          const cells = row.querySelectorAll('th, td');

          cells.forEach((cell) => {
            if (cell.tagName.toLowerCase() === 'th') isHeader = true;
            let cellMd = '';
            for (const child of cell.childNodes) {
              cellMd += walk(child, depth + 1);
            }
            cellMd = cellMd.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            rowMd += ` ${cellMd} |`;
            colCount++;
          });

          tableMd += rowMd + '\n';
          if (isHeader) {
            tableMd += '|' + '---|'.repeat(colCount) + '\n';
          }
        });
        return tableMd + '\n';
      }

      let md = '';

      if (tag === 'div') {
        if (classes.includes('heading1')) md += '\n\n# ';
        else if (classes.includes('heading2')) md += '\n\n## ';
        else if (classes.includes('heading3')) md += '\n\n### ';
        else if (classes.includes('normal') && !classes.includes('table-paragraph')) md += '\n\n';
      } else if (tag === 'h1') md += '\n\n# ';
      else if (tag === 'h2') md += '\n\n## ';
      else if (tag === 'h3') md += '\n\n### ';
      else if (tag === 'p') md += '\n\n';
      else if (tag === 'hr') return '\n\n---\n\n';
      else if (tag === 'b' || tag === 'strong') md += '◈b◈';
      else if (tag === 'i' || tag === 'em') md += '◈i◈';
      else if (tag === 'li') {
        let listDepth = -1;
        let p: Element | null = el.parentElement;
        let isOrdered = false;
        while (p) {
          if (p.tagName === 'UL' || p.tagName === 'OL') {
            listDepth++;
            if (listDepth === 0) isOrdered = p.tagName === 'OL';
          }
          p = p.parentElement;
        }
        const indent = '  '.repeat(Math.max(0, listDepth));
        const marker = isOrdered ? '1. ' : '- ';
        md += `\n${indent}${marker}`;
      }

      let innerMd = '';
      for (const child of el.childNodes) {
        innerMd += walk(child, depth);
      }

      if (tag === 'b' || tag === 'strong') {
        innerMd = innerMd.trim();
        md += innerMd + '◈/b◈';
      } else if (tag === 'i' || tag === 'em') {
        innerMd = innerMd.trim();
        md += innerMd + '◈/i◈';
      } else {
        md += innerMd;
      }

      return md;
    };

    let result = walk(doc.body);

    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/^\s+|\s+$/g, '');

    result = result.replace(/\*\*([^*]+?)\*\*/g, (match, innerText: string) => {
      if (/^[a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ\s]+$/.test(innerText)) {
        return match;
      }
      return innerText;
    });

    result = result.replace(/◈b◈/g, '**').replace(/◈\/b◈/g, '**');
    result = result.replace(/◈i◈/g, '*').replace(/◈\/i◈/g, '*');

    result = result.replace(/\*\*(.*?)\*\*/g, (_match, innerText: string) => {
      const processed = innerText.replace(/\(/g, '**(**').replace(/\)/g, '**)**');
      return '**' + processed + '**';
    });

    result = result.replace(/\*\*\s*\*\*/g, '');

    result = result.replace(/\*\*([^*]+?)\*\*/g, (_match, innerText: string) => {
      if (!innerText.trim()) return '';
      const matchStartSpace = innerText.match(/^\s+/);
      const matchEndSpace = innerText.match(/\s+$/);
      const startSpace = matchStartSpace ? matchStartSpace[0] : '';
      const endSpace = matchEndSpace ? matchEndSpace[0] : '';
      return startSpace + '**' + innerText.trim() + '**' + endSpace;
    });

    result = result.replace(/-\*\*/g, '- **');

    return result;
  } catch (e) {
    console.error('NotebookLM parsing error:', e);
    return '오류: HTML을 분석하는 중 문제가 발생했습니다.';
  }
}
