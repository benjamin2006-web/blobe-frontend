export const optimizeImageUrl = (value) => value;

export const getResponsiveImageSources = (sources = []) => {
  const unique = new Map();
  sources.forEach(({ url, width }) => {
    const parsedWidth = Number(width);
    if (
      typeof url === 'string' &&
      url &&
      Number.isFinite(parsedWidth) &&
      parsedWidth > 0 &&
      !unique.has(parsedWidth)
    ) {
      unique.set(parsedWidth, url);
    }
  });
  if (unique.size < 2) return undefined;
  return [...unique]
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ');
};

export const optimizedImageProps = (
  value,
  { width, height, sizes = '100vw', widths } = {},
) => ({
  src: optimizeImageUrl(value, { width, height }),
  ...(getResponsiveImageSources(Array.isArray(widths) ? widths : []) && {
    srcSet: getResponsiveImageSources(widths),
    sizes,
  }),
});
