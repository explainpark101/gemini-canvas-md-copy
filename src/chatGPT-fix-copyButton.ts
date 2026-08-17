import { htmlToMarkdown } from './html-to-markdown';
import { showCopyFeedback } from './toasts.ts';

const assistantSectionSelector = '[data-turn="assistant"]:not([data-added-md-copy-button])';
// const assistantMessageActionGroupSelector = `[role="group"]:has(>button[data-testid="copy-turn-action-button"])`
const assistantMessageCopySelector = `[data-testid="copy-turn-action-button"]`
const assistantMessageHTMLSelector = `[data-message-author-role="assistant"] .markdown`

// mutation Observer to add new copy button to assistant message

const waitUntilLoaded = async (selector: string) : Promise<Element> => {
    return Promise.race([
        new Promise<Element>((resolve) => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && (node as Element).matches(selector)) {
                            observer.disconnect();
                            resolve(node as Element);
                        }
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }),
        new Promise<Element>((resolve) => {
            let interval = setInterval(() => {
                const element = document.querySelector(selector) as Element;
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 1000);
        }),
    ]);
};


(async () => {
    
    const observeTarget = await waitUntilLoaded(`.contents main #thread div:has(>[data-turn-id-container])`)
    
    const addCopyButton = (assistantMessage: Element) => {
        const newCopyButton = document.createElement('button');
        newCopyButton.setAttribute('type', 'button');
        newCopyButton.setAttribute('data-testid', 'copy-turn-action-button-md');
        newCopyButton.setAttribute('aria-label', 'Copy Fixed Markdown');
        newCopyButton.setAttribute('data-state', 'closed');
        newCopyButton.setAttribute('class', 'text-token-text-secondary hover:bg-token-surface-hover rounded-lg');
        newCopyButton.setAttribute('data-state', 'closed');
        newCopyButton.title = 'Copy Fixed Markdown';
        newCopyButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-copy-icon lucide-book-copy"><path d="M5 7a2 2 0 0 0-2 2v11"/><path d="M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21"/><path d="M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10"/></svg>
        `; // svg of copy markdown
        newCopyButton.addEventListener('click', () => {
            const html = assistantMessage.querySelector(assistantMessageHTMLSelector)?.innerHTML;
            if (html) {
                const markdown = htmlToMarkdown(html);
                navigator.clipboard.writeText(markdown);
                showCopyFeedback();
            }
        });
    
        assistantMessage.querySelector(assistantMessageCopySelector)?.insertAdjacentElement("beforebegin", newCopyButton);
    
        assistantMessage.setAttribute('data-added-md-copy-button', 'true');
    }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const el = node as Element;
            const assistantMessages = el.querySelectorAll(assistantSectionSelector);
            
            assistantMessages.forEach((assistantMessage) => {
                addCopyButton(assistantMessage);
            });
          }
        });
      });
    });
    
    observer.observe(observeTarget, { childList: true });
    
    const assistantMessages = observeTarget.querySelectorAll(assistantSectionSelector);
    assistantMessages.forEach((assistantMessage) => {
        addCopyButton(assistantMessage);
    });
})();