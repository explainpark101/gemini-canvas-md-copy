/**
 * Citation copy mode preference.
 * Footnote: inline [^n] + source list at bottom.
 * Link: inline [n](url) only (no bottom source list).
 *
 * Stored in chrome.storage.sync so the user's mode choice persists across
 * sessions/devices and is shared by the action popup, badge/title, and
 * floating copy button. Only this preference key is written — no page or
 * clipboard content is stored.
 */

export const CITATION_MODE_STORAGE_KEY = 'citationMode';

export const CITATION_MODES = ['footnote', 'link', 'none'] as const;

export type CitationMode = (typeof CITATION_MODES)[number];

export const DEFAULT_CITATION_MODE: CitationMode = 'none';

export const CITATION_MODE_LABELS: Record<CitationMode, string> = {
  footnote: '각주모드',
  link: '링크모드',
  none: '출처 복사 안함',
};

export function isCitationMode(value: unknown): value is CitationMode {
  return typeof value === 'string' && (CITATION_MODES as readonly string[]).includes(value);
}

export async function getStoredCitationMode(): Promise<CitationMode> {
  const stored = await chrome.storage.sync.get(CITATION_MODE_STORAGE_KEY);
  const raw = stored[CITATION_MODE_STORAGE_KEY];
  return isCitationMode(raw) ? raw : DEFAULT_CITATION_MODE;
}
