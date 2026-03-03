import { useState, useEffect, useRef, useCallback } from 'react';
import type { SearchAddon } from 'xterm-addon-search';

/** Decoration colors for highlighted search matches.
 *  All matches render with a yellow background/border; the active match uses orange. */
const SEARCH_DECORATIONS = {
  matchBackground: '#f59e0b33',
  matchBorder: '#f59e0b',
  matchOverviewRuler: '#f59e0b',
  activeMatchBackground: '#f97316',
  activeMatchBorder: '#f97316',
  activeMatchColorOverviewRuler: '#f97316',
} as const;

interface TerminalSearchOverlayProps {
  searchAddonRef: React.RefObject<SearchAddon | null>;
  onClose: () => void;
  initialQuery: string;
  onQueryChange: (query: string) => void;
  terminalFocusRef?: React.MutableRefObject<(() => void) | null>;
}

/** Floating search overlay rendered in the top-right corner of the terminal pane.
 *
 * Features:
 * - Auto-focuses the input on mount so the operator can type immediately
 * - Debounces search at 300ms to avoid blocking the UI during rapid typing
 * - Displays match count in "N / M" format, capped at "1000+" per the 1000-match limit
 * - Yellow gutter markers on the scrollbar track via overviewRuler integration
 * - Enter/Shift+Enter and Prev/Next buttons navigate between matches
 * - Escape closes overlay and returns focus to the terminal canvas
 * - Clears decorations on unmount so highlights do not persist after close */
export function TerminalSearchOverlay({
  searchAddonRef,
  onClose,
  initialQuery,
  onQueryChange,
  terminalFocusRef,
}: TerminalSearchOverlayProps) {
  const [query, setQuery] = useState(initialQuery);
  const [matchResultIndex, setMatchResultIndex] = useState<number>(-1);
  const [matchResultCount, setMatchResultCount] = useState<number>(0);
  const [isMounted, setIsMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger CSS entry animation after first render tick
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Subscribe to match count changes from the SearchAddon
  useEffect(() => {
    const addon = searchAddonRef.current;
    if (!addon) return;

    const disposable = addon.onDidChangeResults(({ resultIndex, resultCount }) => {
      setMatchResultIndex(resultIndex);
      setMatchResultCount(resultCount);
    });

    return () => disposable.dispose();
  }, [searchAddonRef]);

  // Perform search immediately when query changes, debounced at 300ms
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!query) {
      searchAddonRef.current?.clearDecorations();
      setMatchResultIndex(-1);
      setMatchResultCount(0);
      onQueryChange('');
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATIONS });
      onQueryChange(query);
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, searchAddonRef, onQueryChange]);

  // Clear decorations on unmount so highlights do not persist after the overlay closes
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      searchAddonRef.current?.clearDecorations();
    };
  }, [searchAddonRef]);

  const handleClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      terminalFocusRef?.current?.();
    });
  }, [onClose, terminalFocusRef]);

  const findNext = useCallback(() => {
    if (!query) return;
    searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATIONS });
  }, [query, searchAddonRef]);

  const findPrevious = useCallback(() => {
    if (!query) return;
    searchAddonRef.current?.findPrevious(query, { decorations: SEARCH_DECORATIONS });
  }, [query, searchAddonRef]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    }
  }, [findNext, findPrevious, handleClose]);

  /** Format match count for display.
   *  - No query or zero matches → "No results"
   *  - resultCount >= 1000 → "N / 1000+"
   *  - Normal → "N / M"
   *  - resultIndex === -1 (no active match) → "0 / M" or "No results" */
  const matchCountDisplay = (): string => {
    if (!query || matchResultCount === 0) return 'No results';
    const activeIndex = matchResultIndex === -1 ? 0 : matchResultIndex + 1;
    const totalDisplay = matchResultCount >= 1000 ? '1000+' : String(matchResultCount);
    return `${activeIndex} / ${totalDisplay}`;
  };

  return (
    <div
      className={`absolute top-2 right-2 z-40 flex items-center gap-1 px-2 py-1.5 bg-warden-panel border border-warden-border rounded shadow-lg transition-all duration-150 ease-out ${
        isMounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
      }`}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search terminal..."
        className="w-44 px-2 py-0.5 text-xs font-mono bg-warden-bg text-warden-text border border-warden-border rounded outline-none focus:border-warden-accent transition-colors"
      />

      <span className="text-[10px] font-mono text-warden-text-dim whitespace-nowrap min-w-[60px] text-right">
        {matchCountDisplay()}
      </span>

      <button
        onClick={findPrevious}
        title="Previous match (Shift+Enter)"
        className="px-1.5 py-0.5 text-xs text-warden-text-dim bg-warden-border/40 hover:bg-warden-border/70 hover:text-warden-text rounded transition-colors"
      >
        &#8963;
      </button>

      <button
        onClick={findNext}
        title="Next match (Enter)"
        className="px-1.5 py-0.5 text-xs text-warden-text-dim bg-warden-border/40 hover:bg-warden-border/70 hover:text-warden-text rounded transition-colors"
      >
        &#8964;
      </button>

      <button
        onClick={handleClose}
        title="Close search (Escape)"
        className="px-1.5 py-0.5 text-xs text-warden-text-dim bg-warden-border/40 hover:bg-warden-border/70 hover:text-warden-text rounded transition-colors"
      >
        &#10005;
      </button>
    </div>
  );
}
