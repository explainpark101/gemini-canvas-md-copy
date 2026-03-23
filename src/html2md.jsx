import React, { useState, useEffect } from 'react';
import { ArrowRight, Copy, Check } from 'lucide-react';

// --- BFS Parsing Logic ---
function parseHtmlToMarkdownBfs(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const mdRoot = { type: 'root', children: [] };
  const queue = [{ domNode: doc.body, mdNode: mdRoot }];

  // BFS를 사용하여 DOM 노드를 큐에 넣고 순회하며 Markdown 트리 생성
  while (queue.length > 0) {
    const { domNode, mdNode } = queue.shift();

    domNode.childNodes.forEach((child) => {
      const type = child.nodeName.toLowerCase();
      const newMdNode = {
        type: type,
        children: [],
        text: child.nodeValue || '',
        attributes: {},
      };

      if (child.nodeType === Node.ELEMENT_NODE) {
        for (let attr of child.attributes) {
          newMdNode.attributes[attr.name] = attr.value;
        }
      }

      mdNode.children.push(newMdNode);
      queue.push({ domNode: child, mdNode: newMdNode });
    });
  }

  return renderMdTree(mdRoot).replace(/\n{3,}/g, '\n\n').trim();
}

function renderMdTree(node, depth = 0) {
  if (node.type === '#text') {
    return node.text.replace(/\s+/g, ' ');
  }

  const nextDepth = node.type === 'li' ? depth + 1 : depth;
  const childContent = node.children.map(child => renderMdTree(child, nextDepth)).join('');

  switch (node.type) {
    case 'h1': return `\n# ${childContent}\n\n`;
    case 'h2': return `\n## ${childContent}\n\n`;
    case 'h3': return `\n### ${childContent}\n\n`;
    case 'h4': return `\n#### ${childContent}\n\n`;
    case 'p': return `\n${childContent}\n\n`;
    case 'strong':
    case 'b': return `**${childContent.trim()}**`;
    case 'em':
    case 'i': return `*${childContent.trim()}*`;
    case 'a': return `[${childContent.trim()}](${node.attributes.href || ''})`;
    case 'img': {
      const src = node.attributes.src || '';
      if (!src.trim()) return '';
      return `![${node.attributes.alt || ''}](${src})`;
    }
    case 'ul': return `\n${childContent}\n`;
    case 'ol': return `\n${childContent}\n`;
    case 'li': {
      const indent = '  '.repeat(depth);
      const content = childContent.trim();
      if (!content) return '';
      const lines = content.split('\n');
      const formatted = lines.map((line, i) => {
        if (i === 0) return `${indent}- ${line}`;
        if (line.trim() === '') return '';
        // 이미 들여쓰기된 중첩 리스트는 유지하고, 문단 등은 깊이에 맞게 들여쓰기 적용
        return /^\s/.test(line) ? line : `  ${indent}${line}`;
      }).join('\n');
      return `${formatted}\n`;
    }
    case 'br': return `\n`;
    case 'code': return `\`${childContent.trim()}\``;
    case 'pre': return `\n\`\`\`\n${childContent}\n\`\`\`\n`;
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
    case 'root': return childContent;
    default: return childContent;
  }
}

// --- React Component ---
export default function App() {
  const [htmlInput, setHtmlInput] = useState(
`<h1>안녕하세요</h1>
<p>이것은 <strong>BFS</strong> 알고리즘을 사용한 파서입니다.</p>
<ul>
  <li>
    <p>HTML 노드를 레벨 단위로 탐색합니다.</p>
    <ul>
      <li>
        <p>중첩된 리스트 들여쓰기 버그가 해결되었습니다.</p>
      </li>
    </ul>
  </li>
  <li><a href="https://example.com">마크다운</a>으로 안전하게 변환됩니다.</li>
</ul>
<h2>수식 변환 예시</h2>
<p>인라인 수식은 <math-inline data-math="a^2 + b^2 = c^2"></math-inline> 이렇게 변환됩니다.</p>
<p>한글 띄어쓰기 보정: <math-inline data-math="한글 띄어쓰기"></math-inline></p>
<math-block data-math="\\int_{a}^{b} f(x) \\,dx"></math-block>`
  );
  const [markdownOutput, setMarkdownOutput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const result = parseHtmlToMarkdownBfs(htmlInput);
      setMarkdownOutput(result);
    } catch (e) {
      setMarkdownOutput('파싱 오류가 발생했습니다.');
    }
  }, [htmlInput]);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8 font-sans text-neutral-800">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">HTML to Markdown (BFS Parser)</h1>
          <p className="text-neutral-500 mt-2">BFS 알고리즘으로 트리를 구성하여 변환합니다.</p>
        </header>

        <main className="flex flex-col md:flex-row gap-6 bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 h-[600px]">
          {/* HTML Input Area */}
          <div className="flex-1 flex flex-col shrink-0 min-w-0">
            <label className="text-sm font-semibold text-neutral-700 mb-2 flex justify-between items-center">
              HTML 입력
            </label>
            <textarea
              className="flex-1 w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              placeholder="HTML 코드를 입력하세요..."
            />
          </div>

          {/* Divider/Icon */}
          <div className="hidden md:flex flex-col justify-center items-center shrink-0">
            <div className="bg-neutral-100 p-3 rounded-full text-neutral-400">
              <ArrowRight size={24} />
            </div>
          </div>

          {/* Markdown Output Area */}
          <div className="flex-1 flex flex-col shrink-0 min-w-0">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-neutral-700">
                Markdown 결과
              </label>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <textarea
              readOnly
              className="flex-1 w-full p-4 bg-neutral-900 text-neutral-100 border border-neutral-800 rounded-xl resize-none focus:outline-none font-mono text-sm"
              value={markdownOutput}
              placeholder="결과가 여기에 표시됩니다..."
            />
          </div>
        </main>
      </div>
    </div>
  );
}