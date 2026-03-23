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

/** Gemini 출처 캐러셀 등 마크다운에 포함하지 않을 커스텀 엘리먼트 */
const SKIP_ELEMENT_TAGS = new Set(['sources-carousel-inline', 'source-inline-chip']);

function parseHtmlToMarkdownBfs(htmlString: string): string {
  const body = parseHTML(htmlString);

  const mdRoot: MdNode = { type: 'root', children: [], text: '', attributes: {} };
  const queue: { domNode: Node; mdNode: MdNode }[] = [{ domNode: body, mdNode: mdRoot }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { domNode, mdNode } = item;

    domNode.childNodes.forEach((child) => {
      const type = child.nodeName.toLowerCase();
      if (child.nodeType === Node.ELEMENT_NODE && SKIP_ELEMENT_TAGS.has(type)) {
        return;
      }
      const newMdNode: MdNode = {
        type,
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
      }

      mdNode.children.push(newMdNode);
      queue.push({ domNode: child, mdNode: newMdNode });
    });
  }

  return renderMdTree(mdRoot).replace(/\n{3,}/g, '\n\n').trim();
}

function renderMdTree(node: MdNode, depth = 0): string {
  if (node.type === '#text') {
    return node.text.replace(/\s+/g, ' ');
  }

  const nextDepth = node.type === 'li' ? depth + 1 : depth;
  const childContent = node.children.map((child) => renderMdTree(child, nextDepth)).join('');

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
      return `\n`;
    case 'code':
      return `\`${childContent.trim()}\``;
    case 'pre':
      return `\n\`\`\`\n${childContent}\n\`\`\`\n`;
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
  const node = new DOMParser().parseFromString(html, 'text/html').body;
  node.querySelectorAll(`${Array.from(SKIP_ELEMENT_TAGS).join(',')}`).forEach((el) => {
    el.remove();
  });
  return parseHtmlToMarkdownBfs(node.innerHTML);
}
