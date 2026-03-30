/**
 * HTML을 Markdown으로 변환하는 공유 유틸리티 (BFS 트리 파싱 + renderMdTree)
 */

// Trusted Types 정책 설정 (보안 정책 우회용)
let trustedPolicy: { createHTML: (s: string) => string };
const tt = (globalThis as { trustedTypes?: { createPolicy: (n: string, o: object) => unknown } }).trustedTypes;
if (tt?.createPolicy) {
  try {
    trustedPolicy = tt.createPolicy('markdown-copy-policy', {
      createHTML: (s: string) => s,
    }) as { createHTML: (s: string) => string };
  } catch {
    trustedPolicy = { createHTML: (s: string) => s };
  }
} else {
  trustedPolicy = { createHTML: (s: string) => s };
}

/** 문자열을 파싱하여 DOM 객체의 body 반환 */
export function parseHTML(htmlString: string): HTMLElement {
  const parser = new DOMParser();
  const safeHTML = trustedPolicy.createHTML(htmlString);
  const doc = parser.parseFromString(safeHTML, 'text/html');
  return doc.body;
}

interface MdNode {
  type: string;
  children: MdNode[];
  text: string;
  attributes: Record<string, string>;
}

/** Gemini 출처 캐러셀·각주 등 마크다운에 포함하지 않을 커스텀 엘리먼트 */
const SKIP_ELEMENT_TAGS = new Set([
  'sources-carousel-inline',
  'source-inline-chip',
  'source-footnote',
]);

/** 태그 외에 class로만 표시되는 출처 UI 래퍼 (선택 복사 시 부모 태그가 잘려도 남는 경우 대비) */
const SKIP_ELEMENT_CLASS_NAMES = new Set(['source-inline-chip', 'source-inline-chip-container']);

/** 출처 칩 라벨(+N 등): 선택 영역 복사 시 커스텀 태그가 깨져도 이 속성이 있으면 스킵 */
const SKIP_IF_HAS_ATTRIBUTE = 'hide-from-message-actions';

function shouldSkipDomElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  const tag = el.nodeName.toLowerCase();
  if (SKIP_ELEMENT_TAGS.has(tag)) return true;
  if (el.hasAttribute(SKIP_IF_HAS_ATTRIBUTE)) return true;
  for (const cls of SKIP_ELEMENT_CLASS_NAMES) {
    if (el.classList.contains(cls)) return true;
  }
  return false;
}

/** htmlToMarkdown 전처리용: 태그·클래스·속성 셀렉터로 한 번에 제거 */
function skipElementRemovalSelector(): string {
  const parts = [
    ...SKIP_ELEMENT_TAGS,
    ...[...SKIP_ELEMENT_CLASS_NAMES].map((c) => `.${CSS.escape(c)}`),
    `[${SKIP_IF_HAS_ATTRIBUTE}]`,
  ];
  return parts.join(',');
}

/**
 * 선택 복사(cloneContents) 등으로 커스텀 태그가 없어지고 `+2` 같은 텍스트만 남는 경우 제거
 */
function stripOrphanSourceCountTextNodes(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const toRemove: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    const t = n as Text;
    const raw = t.nodeValue ?? '';
    if (/^\s*\+\d+\s*$/.test(raw)) {
      const p = t.parentElement;
      if (p && /^(p|span|li|div|button)$/i.test(p.tagName)) {
        toRemove.push(t);
      }
    }
    n = walker.nextNode();
  }
  for (const t of toRemove) {
    t.remove();
  }
}

/**
 * Gemini 캔버스 등은 `<math-block>` 대신 `<div class="math-block" data-math="...">` 형태를 씀.
 * 인라인은 `<span class="math-inline" data-math="...">` + 내부 `.katex` 조합이 흔함.
 * 태그명만 보면 수식이 `div`/`span`으로만 잡혀 KaTeX HTML만 풀리므로 class·data-math·annotation으로 정규화한다.
 */
function normalizeMathElementType(tag: string, node: Node): string {
  if (tag === 'math-block' || tag === 'math-inline' || tag === 'math-display') {
    return tag;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return tag;
  const el = node as Element;
  if (el.classList.contains('math-block')) return 'math-block';
  if (el.classList.contains('math-display')) return 'math-display';
  if (el.classList.contains('math-inline')) return 'math-inline';
  const dataMath = (el.getAttribute('data-math') || '').trim();
  if (dataMath) {
    if (tag === 'span') return 'math-inline';
    if (tag === 'div') return 'math-block';
  }
  return tag;
}

/** `data-math`가 없을 때 KaTeX MathML annotation에서 LaTeX 소스를 복구 */
function augmentKatexFromAnnotation(el: Element, mdNode: MdNode): void {
  if ((mdNode.attributes['data-math'] || '').trim()) return;
  if (!el.classList.contains('katex')) return;
  const ann = el.querySelector('annotation[encoding="application/x-tex"]');
  const tex = ann?.textContent?.trim();
  if (!tex) return;
  mdNode.attributes['data-math'] = tex;
  const isDisplay =
    el.classList.contains('katex-display') ||
    Boolean(el.parentElement?.classList.contains('katex-display'));
  mdNode.type = isDisplay ? 'math-display' : 'math-inline';
}

function collectTrNodes(table: MdNode): MdNode[] {
  const out: MdNode[] = [];
  function walk(x: MdNode): void {
    if (x.type === 'tr') {
      out.push(x);
      return;
    }
    for (const c of x.children) walk(c);
  }
  walk(table);
  return out;
}

function renderMarkdownTable(table: MdNode): string {
  const rows = collectTrNodes(table);
  if (rows.length === 0) return '';

  const cellLines = rows.map((row) => {
    const cells = row.children.filter((c) => c.type === 'th' || c.type === 'td');
    return cells.map((cell) => {
      const text = renderMdTree(cell, 0, null, true).replace(/\n/g, ' ').trim();
      return text.replace(/\|/g, '\\|');
    });
  });

  const colCount = Math.max(...cellLines.map((r) => r.length), 0);
  if (colCount === 0) return '';

  const pad = (arr: string[]) => {
    const a = [...arr];
    while (a.length < colCount) a.push('');
    return a;
  };

  const toRow = (arr: string[]) => '| ' + pad(arr).join(' | ') + ' |';
  const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';

  let md = '\n' + toRow(cellLines[0]!) + '\n' + sep;
  for (let i = 1; i < cellLines.length; i++) {
    md += '\n' + toRow(cellLines[i]!);
  }
  return md + '\n';
}

function parseHtmlToMarkdownBfs(htmlString: string): string {
  const body = parseHTML(htmlString);

  const mdRoot: MdNode = { type: 'root', children: [], text: '', attributes: {} };
  const queue: { domNode: Node; mdNode: MdNode }[] = [{ domNode: body, mdNode: mdRoot }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { domNode, mdNode } = item;

    domNode.childNodes.forEach((child) => {
      const rawTag = child.nodeName.toLowerCase();
      if (shouldSkipDomElement(child)) {
        return;
      }
      const newMdNode: MdNode = {
        type: rawTag,
        children: [],
        text: child.nodeValue || '',
        attributes: {},
      };

      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          if (attr) {
            newMdNode.attributes[attr.name] = attr.value;
          }
        }
        if (rawTag === 'code') {
          let t = (el as HTMLElement).textContent ?? '';
          t = t.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
          newMdNode.attributes['__codeText__'] = t;
        }
        newMdNode.type = normalizeMathElementType(rawTag, child);
        augmentKatexFromAnnotation(el, newMdNode);
      }

      mdNode.children.push(newMdNode);
      const mathFromAttr = (newMdNode.attributes['data-math'] || '').trim();
      const skipMathChildren =
        mathFromAttr &&
        (newMdNode.type === 'math-block' ||
          newMdNode.type === 'math-display' ||
          newMdNode.type === 'math-inline');
      if (!skipMathChildren) {
        queue.push({ domNode: child, mdNode: newMdNode });
      }
    });
  }

  return renderMdTree(mdRoot).replace(/\n{3,}/g, '\n\n').trim();
}

function renderMdTree(node: MdNode, depth = 0, parentType: string | null = null, inTableCell = false): string {
  if (node.type === '#text') {
    if (parentType === 'pre') {
      return node.text.replace(/\r\n/g, '\n');
    }
    return node.text.replace(/\s+/g, ' ');
  }

  if (node.type === 'table') {
    return renderMarkdownTable(node);
  }

  if (node.type === 'code') {
    let raw = node.attributes['__codeText__'];
    if (raw === undefined) {
      raw = node.children.map((c) => renderMdTree(c, depth, 'code', inTableCell)).join('');
    } else {
      raw = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    }
    if (parentType === 'pre') {
      return raw;
    }
    const escaped = raw.replace(/`/g, '\\`');
    return `\`${escaped}\``;
  }

  const nextDepth = node.type === 'li' ? depth + 1 : depth;
  const passTableCell = inTableCell || node.type === 'th' || node.type === 'td';
  const childContent = node.children.map((child) => renderMdTree(child, nextDepth, node.type, passTableCell)).join('');

  switch (node.type) {
    case 'h1':
      return `\n# ${childContent}\n\n`;
    case 'h2':
      return `\n## ${childContent}\n\n`;
    case 'h3':
      return `\n### ${childContent}\n\n`;
    case 'h4':
      return `\n#### ${childContent}\n\n`;
    case 'p':
      if (inTableCell) {
        return childContent.trim();
      }
      return `\n${childContent}\n\n`;
    case 'strong':
    case 'b':
      return `**${childContent.trim()}**`;
    case 'em':
    case 'i':
      return `*${childContent.trim()}*`;
    case 'a':
      return `[${childContent.trim()}](${node.attributes.href || ''})`;
    case 'img': {
      const src = node.attributes.src || '';
      if (!src.trim()) return '';
      return `![${node.attributes.alt || ''}](${src})`;
    }
    case 'ul':
      return `\n${childContent}\n`;
    case 'ol':
      return `\n${childContent}\n`;
    case 'li': {
      const indent = '  '.repeat(depth);
      const content = childContent.trim();
      if (!content) return '';
      const lines = content.split('\n');
      const formatted = lines
        .map((line, i) => {
          if (i === 0) return `${indent}- ${line}`;
          if (line.trim() === '') return '';
          return /^\s/.test(line) ? line : `  ${indent}${line}`;
        })
        .join('\n');
      return `${formatted}\n`;
    }
    case 'br':
      return inTableCell ? ' ' : `\n`;
    case 'pre':
      return `\n\`\`\`\n${childContent}\n\`\`\`\n`;
    case 'th':
    case 'td':
      return childContent.trim();
    case 'math-inline': {
      let inlineLatex = node.attributes['data-math'] || '';
      if (inlineLatex.trim()) {
        inlineLatex = inlineLatex.replace(/([가-힣ㄱ-ㅎ]) ([가-힣ㄱ-ㅎ])/g, '$1\\ $2');
        return `$${inlineLatex}$`;
      }
      return '';
    }
    case 'math-block':
    case 'math-display': {
      let blockLatex = node.attributes['data-math'] || '';
      if (blockLatex.trim()) {
        blockLatex = blockLatex.replace(/([가-힣ㄱ-ㅎ]) ([가-힣ㄱ-ㅎ])/g, '$1\\ $2');
        return `\n$$\n${blockLatex}\n$$\n`;
      }
      return '';
    }
    case 'root':
      return childContent;
    default:
      return childContent;
  }
}

/**
 * HTML 문자열을 Markdown으로 변환
 */
export function htmlToMarkdown(html: string): string {
  const body = parseHTML(html);
  body.querySelectorAll(skipElementRemovalSelector()).forEach((el) => {
    el.remove();
  });
  stripOrphanSourceCountTextNodes(body);
  return parseHtmlToMarkdownBfs(body.innerHTML);
}
