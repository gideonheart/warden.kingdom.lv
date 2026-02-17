import { useState, useCallback, useRef, useEffect } from 'react';
import { PromptPanel } from './PromptPanel.js';
import type { AgentDetails } from '../../shared/openclawTypes.js';

interface MobilePromptSheetProps {
  agents: AgentDetails[];
  selectedAgentId: string | null;
}

export function MobilePromptSheet({ agents, selectedAgentId }: MobilePromptSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const handleCollapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // Collapse when clicking outside the sheet
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    // Use timeout to avoid catching the same click that opened the sheet
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as EventListener);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as EventListener);
    };
  }, [isExpanded]);

  // Float above iOS keyboard by tracking visual viewport offset
  useEffect(() => {
    const viewport = window.visualViewport;
    const sheet = sheetRef.current;
    if (!viewport || !sheet) return;

    const updateBottomPosition = () => {
      const offsetFromLayoutBottom =
        window.innerHeight - (viewport.offsetTop + viewport.height);
      sheet.style.bottom = `${Math.max(0, offsetFromLayoutBottom)}px`;
    };

    viewport.addEventListener('resize', updateBottomPosition);
    viewport.addEventListener('scroll', updateBottomPosition);
    updateBottomPosition();

    return () => {
      viewport.removeEventListener('resize', updateBottomPosition);
      viewport.removeEventListener('scroll', updateBottomPosition);
      sheet.style.bottom = '';
    };
  }, []);

  return (
    <>
      {/* Backdrop when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          onClick={handleCollapse}
        />
      )}

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-warden-panel border-t border-warden-border transition-all duration-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {isExpanded ? (
          <>
            {/* Drag handle (decorative) */}
            <div className="flex justify-center py-2">
              <div className="w-8 h-1 rounded-full bg-warden-border" />
            </div>

            {/* Full prompt panel */}
            <PromptPanel agents={agents} selectedAgentId={selectedAgentId} />
          </>
        ) : (
          /* Collapsed: textarea peek */
          <button
            onClick={handleExpand}
            className="w-full flex items-center gap-2 px-4 py-3 min-h-[48px] text-left"
          >
            <span className="flex-1 text-sm text-warden-text-dim/60 truncate">
              Tap to send prompt...
            </span>
            <span className="text-xs text-warden-text-dim/40">&#9650;</span>
          </button>
        )}
      </div>
    </>
  );
}
