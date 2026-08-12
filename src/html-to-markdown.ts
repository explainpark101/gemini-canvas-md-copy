/**
 * HTML을 Markdown으로 변환하는 공유 유틸리티 (BFS 트리 파싱 + renderMdTree)
 */

import type { CitationMode } from './citation-mode.ts';

export interface HtmlToMarkdownOptions {
  citationMode?: CitationMode;
  /** Canvas root used to collect deep-research used-sources (footnote mode). */
  sourcesRoot?: ParentNode | null;
}

export interface UsedSource {
  index: number;
  href: string;
  domain: string;
  title: string;
}

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
const SKIP_ELEMENT_CLASS_NAMES = new Set([
  'source-inline-chip',
  'source-inline-chip-container',
  'sources-carousel-inline',
]);

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
 * Always drop Gemini inline source carousels from copy output.
 * Handles both the custom element and class-only remnants after selection clone.
 */
function stripSourcesCarouselInline(root: HTMLElement): void {
  root
    .querySelectorAll('sources-carousel-inline, .sources-carousel-inline')
    .forEach((el) => el.remove());
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

function renderMdTree(
  node: MdNode,
  depth = 0,
  parentType: string | null = null,
  inTableCell = false,
  olLiIndex?: number,
): string {
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
  let childContent: string;
  if (node.type === 'ol') {
    let liOrdinal = 0;
    childContent = node.children
      .map((child) => {
        if (child.type === 'li') {
          liOrdinal += 1;
          return renderMdTree(child, nextDepth, node.type, passTableCell, liOrdinal);
        }
        return renderMdTree(child, nextDepth, node.type, passTableCell);
      })
      .join('');
  } else {
    childContent = node.children
      .map((child) => renderMdTree(child, nextDepth, node.type, passTableCell))
      .join('');
  }

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
      const marker =
        parentType === 'ol' && olLiIndex !== undefined ? `${olLiIndex}. ` : '- ';
      const lines = content.split('\n');
      const formatted = lines
        .map((line, i) => {
          if (i === 0) return `${indent}${marker}${line}`;
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
 * Replace source-footnote markers with Markdown footnote refs: [^n]
 * Consecutive duplicate indices are collapsed to a single marker.
 */
function convertSourceFootnotesToMarkers(root: HTMLElement): void {
  const footnotes = Array.from(root.querySelectorAll('source-footnote'));
  let lastIndex: string | null = null;

  for (const el of footnotes) {
    const sup = el.querySelector('sup[data-turn-source-index]');
    const index = (sup?.getAttribute('data-turn-source-index') || '').trim();
    if (!/^\d+$/.test(index)) {
      el.remove();
      lastIndex = null;
      continue;
    }
    if (index === lastIndex) {
      el.remove();
      continue;
    }
    lastIndex = index;
    el.replaceWith(root.ownerDocument.createTextNode(`[^${index}]`));
  }
}

/** Source name = domain-name + sub-title */
function sourceDisplayName(source: UsedSource): string {
  return [source.domain, source.title].filter(Boolean).join(' ').trim();
}

function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\[/g, '').replace(/\]/g, '');
}

/**
 * Replace source-footnote markers with inline Markdown links: [sourceName](url)
 * Consecutive duplicate indices are collapsed to a single marker.
 */
function convertSourceFootnotesToLinks(root: HTMLElement, sources: UsedSource[]): void {
  const sourceByIndex = new Map<number, UsedSource>();
  for (const source of sources) {
    sourceByIndex.set(source.index, source);
  }

  const footnotes = Array.from(root.querySelectorAll('source-footnote'));
  let lastIndex: string | null = null;

  for (const el of footnotes) {
    const sup = el.querySelector('sup[data-turn-source-index]');
    const index = (sup?.getAttribute('data-turn-source-index') || '').trim();
    if (!/^\d+$/.test(index)) {
      el.remove();
      lastIndex = null;
      continue;
    }
    if (index === lastIndex) {
      el.remove();
      continue;
    }
    lastIndex = index;

    const source = sourceByIndex.get(Number(index));
    const href = source?.href || '';
    const name = source ? sourceDisplayName(source) : '';
    const label = escapeMarkdownLinkLabel(name || index);
    const marker = href ? `[${label}](${href})` : `[${label}]`;
    el.replaceWith(root.ownerDocument.createTextNode(marker));
  }
}

/**
 * Collect used sources from `.response-container-content > deep-research-source-lists`.
 * Index is 1-based list order (matches data-turn-source-index).
 */
export function extractUsedSources(root: ParentNode): UsedSource[] {
  const responseContainer = root.querySelector('.response-container-content');
  const sourceLists =
    responseContainer?.querySelector('deep-research-source-lists') ??
    root.querySelector('deep-research-source-lists');

  const usedSourcesList =
    sourceLists?.querySelector('.source-list.used-sources') ?? null;

  const searchRoot = usedSourcesList ?? sourceLists;
  const anchors = searchRoot
    ? Array.from(searchRoot.querySelectorAll('browse-web-item > a'))
    : [];

  const sources = anchors.map((anchor, i) => {
    const a = anchor as HTMLAnchorElement;
    const content = a.querySelector('[data-test-id="content"]');
    const domain =
      content?.querySelector('[data-test-id="domain-name"]')?.textContent?.trim() || '';
    const title =
      content?.querySelector('[data-test-id="sub-title"]')?.textContent?.trim() || '';
    const href = (a.getAttribute('href') || a.href || '').trim();
    return {
      index: i + 1,
      href,
      domain,
      title,
    };
  });

  console.log('[MD_COPY][citation] source extraction', {
    hasResponseContainer: Boolean(responseContainer),
    hasDeepResearchSourceLists: Boolean(sourceLists),
    hasUsedSourcesList: Boolean(usedSourcesList),
    anchorCount: anchors.length,
    sources,
  });

  return sources;
}

/**
 * Format used sources as Markdown footnote definitions.
 * - footnote: [^n]: sourceName, url  (single line; comma separates subtitle/name from url)
 * - linkFootnote: [^n]: url
 */
export function formatSourceFootnoteDefinitions(
  sources: UsedSource[],
  mode: 'footnote' | 'linkFootnote' = 'footnote',
): string {
  if (sources.length === 0) return '';

  return sources
    .map((source) => {
      if (mode === 'linkFootnote') {
        return source.href
          ? `[^${source.index}]: ${source.href}`
          : `[^${source.index}]:`;
      }

      const name = sourceDisplayName(source);
      if (name && source.href) {
        return `[^${source.index}]: ${name}, ${source.href}`;
      }
      if (name) {
        return `[^${source.index}]: ${name}`;
      }
      if (source.href) {
        return `[^${source.index}]: ${source.href}`;
      }
      return `[^${source.index}]:`;
    })
    .join('\n\n');
}

/**
 * HTML 문자열을 Markdown으로 변환
 */
export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): string {
  const citationMode = options.citationMode ?? 'none';
  const body = parseHTML(html);
  const needsSources =
    citationMode === 'footnote' ||
    citationMode === 'linkFootnote' ||
    citationMode === 'link';
  const sources =
    needsSources && options.sourcesRoot ? extractUsedSources(options.sourcesRoot) : [];

  // Remove carousel UI before citation conversion so chip/label noise never enters markdown.
  stripSourcesCarouselInline(body);

  if (citationMode === 'footnote' || citationMode === 'linkFootnote') {
    convertSourceFootnotesToMarkers(body);
  } else if (citationMode === 'link') {
    convertSourceFootnotesToLinks(body, sources);
  }

  body.querySelectorAll(skipElementRemovalSelector()).forEach((el) => {
    el.remove();
  });
  stripOrphanSourceCountTextNodes(body);

  let markdown = parseHtmlToMarkdownBfs(body.innerHTML);

  // footnote / linkFootnote append definitions at the bottom; link keeps only inline links.
  if (
    (citationMode === 'footnote' || citationMode === 'linkFootnote') &&
    sources.length > 0
  ) {
    const defs = formatSourceFootnoteDefinitions(sources, citationMode);
    if (defs) {
      markdown = `${markdown}\n\n${defs}`;
    }
  }

  return markdown;
}
