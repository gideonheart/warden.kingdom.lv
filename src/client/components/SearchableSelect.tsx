import { useState, useRef, useCallback, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  onSelect?: (value: string) => void;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  onSelect,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions =
    value.trim() === ''
      ? options
      : options.filter((option) =>
          option.toLowerCase().includes(value.toLowerCase()),
        );

  const selectOption = useCallback(
    (option: string) => {
      onChange(option);
      onSelect?.(option);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange, onSelect],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
      setIsOpen(true);
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const handleBlur = useCallback(() => {
    // Delay closing so click events on options fire first
    setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setIsOpen(true);
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex((previous) =>
            previous < filteredOptions.length - 1 ? previous + 1 : 0,
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex((previous) =>
            previous > 0 ? previous - 1 : filteredOptions.length - 1,
          );
          break;
        case 'Enter':
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
            selectOption(filteredOptions[highlightedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filteredOptions, highlightedIndex, selectOption],
  );

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const showDropdown = isOpen && filteredOptions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
      />
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-48 overflow-y-auto bg-warden-panel border border-warden-border rounded shadow-lg"
          role="listbox"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option}
              role="option"
              aria-selected={index === highlightedIndex}
              className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-warden-accent/30 text-warden-text'
                  : 'text-warden-text hover:bg-warden-accent/20'
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
