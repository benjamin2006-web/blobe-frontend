import { Fragment } from 'react';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightedText = ({ text, searchTerm = '' }) => {
  const safeText = typeof text === 'string' ? text : '';
  const terms = searchTerm.match(/[\p{L}\p{N}]+/gu) || [];
  if (terms.length === 0) return safeText;

  const matches = new Set(terms.map((term) => term.toLocaleLowerCase()));
  const pattern = terms
    .sort((first, second) => second.length - first.length)
    .map(escapeRegExp)
    .join('|');
  const segments = safeText.split(new RegExp(`(${pattern})`, 'giu'));
  return segments.map((segment, index) => (
    matches.has(segment.toLocaleLowerCase())
      ? (
        <mark
          key={`match-${index}`}
          className='rounded-sm bg-emerald-400/35 px-0.5 text-emerald-200'
        >
          {segment}
        </mark>
      )
      : <Fragment key={`text-${index}`}>{segment}</Fragment>
  ));
};

export default HighlightedText;
