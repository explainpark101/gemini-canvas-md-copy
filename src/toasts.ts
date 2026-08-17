export function showCopyFeedback(): void {
    const toast = document.createElement('div');
    toast.textContent = 'Copied as Markdown!';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: '#333',
      color: '#fff',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: '2147483647',
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
}