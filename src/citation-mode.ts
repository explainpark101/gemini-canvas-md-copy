/**
 * Citation copy mode preference (options only; footnote/link conversion TBD).
 */

export const CITATION_MODE_STORAGE_KEY = 'citationMode';

export const CITATION_MODES = ['footnote', 'link', 'none'] as const;

export type CitationMode = (typeof CITATION_MODES)[number];

export const DEFAULT_CITATION_MODE: CitationMode = 'none';

export function isCitationMode(value: unknown): value is CitationMode {
  return typeof value === 'string' && (CITATION_MODES as readonly string[]).includes(value);
}
