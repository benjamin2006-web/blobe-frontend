import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import { getCountryCallingCode } from 'libphonenumber-js';

const PhoneCountrySelect = ({
  value,
  options,
  onChange,
  onFocus,
  onBlur,
  iconComponent: CountryIcon,
  disabled,
  readOnly,
  name,
  'aria-label': ariaLabel = 'Select country',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPosition, setMenuPosition] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setSearch('');
        onBlur?.();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setSearch('');
        onBlur?.();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    if (!window.matchMedia('(pointer: coarse)').matches) {
      searchRef.current?.focus();
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onBlur, open]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = options.filter((option) => {
    if (option.divider) return false;
    if (!normalizedSearch) return true;
    const callingCode = option.value
      ? `+${getCountryCallingCode(option.value)}`
      : '';
    return `${option.label} ${callingCode}`
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const selectOption = (option) => {
    onChange(option.value);
    setOpen(false);
    setSearch('');
    onBlur?.();
  };

  const toggleMenu = () => {
    if (disabled || readOnly) return;
    if (open) {
      setOpen(false);
      setSearch('');
      onBlur?.();
      return;
    }

    const bounds = containerRef.current?.getBoundingClientRect();
    if (bounds) {
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, bounds.left),
        window.innerWidth - width - 12,
      );
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 16;
      const placeAbove = below < 240 && above > below;
      const availableHeight = placeAbove ? above : below;
      const maxHeight = Math.max(120, Math.min(320, availableHeight - 8));
      setMenuPosition({
        top: placeAbove
          ? Math.max(8, bounds.top - maxHeight - 8)
          : bounds.bottom + 8,
        left,
        width,
        maxHeight,
      });
    }
    setOpen(true);
    onFocus?.();
  };

  return (
    <div ref={containerRef} className='relative shrink-0'>
      <button
        type='button'
        name={name}
        aria-label={ariaLabel}
        aria-haspopup='listbox'
        aria-expanded={open}
        disabled={disabled}
        className='flex h-full min-w-[100px] items-center gap-2 rounded-l-[11px] bg-gray-50 px-3 text-sm text-gray-800 transition-colors hover:bg-gray-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50'
        onClick={toggleMenu}
      >
        {value ? (
          <CountryIcon
            country={value}
            label={selectedOption?.label || value}
            aria-hidden='true'
          />
        ) : (
          <Globe size={18} className='text-gray-500' aria-hidden='true' />
        )}
        <span className='whitespace-nowrap font-medium'>
          {value ? `+${getCountryCallingCode(value)}` : 'Code'}
        </span>
        <ChevronDown size={15} className='shrink-0 text-gray-500' aria-hidden='true' />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            zIndex: 1000,
          }}
          className='overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-2xl'
        >
          <div className='border-b border-gray-100 p-2'>
            <div className='relative'>
              <Search
                size={16}
                className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'
                aria-hidden='true'
              />
              <input
                ref={searchRef}
                type='search'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Search country or code'
                aria-label='Search countries'
                className='h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-100'
              />
            </div>
          </div>
          <div
            role='listbox'
            aria-label='Countries'
            style={{ maxHeight: Math.max(80, menuPosition.maxHeight - 60) }}
            className='overflow-y-auto p-1'
          >
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const country = option.value;
                const selected = country === value;
                return (
                  <button
                    key={country || 'international'}
                    type='button'
                    role='option'
                    aria-selected={selected}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-green-50 text-green-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => selectOption(option)}
                  >
                    {country ? (
                      <CountryIcon
                        country={country}
                        label={option.label}
                        aria-hidden='true'
                      />
                    ) : (
                      <Globe size={18} className='shrink-0 text-gray-500' aria-hidden='true' />
                    )}
                    <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                    {country && (
                      <span className='shrink-0 tabular-nums text-gray-500'>
                        +{getCountryCallingCode(country)}
                      </span>
                    )}
                    {selected && (
                      <Check size={16} className='shrink-0 text-green-600' aria-hidden='true' />
                    )}
                  </button>
                );
              })
            ) : (
              <p className='px-3 py-5 text-center text-sm text-gray-500'>
                No countries found
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default PhoneCountrySelect;
