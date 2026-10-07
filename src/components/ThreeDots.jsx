/**
 * Reusable three-dot bouncing loader.
 * Uses the existing animate-typingBounce keyframe.
 *
 * Props:
 *   size  — 'xs' | 'sm' | 'md' | 'lg'  (default 'md')
 *   color — any Tailwind color class     (default 'text-current')
 */
const ThreeDots = ({ size = 'md', className = '' }) => {
  const dot = {
    xs: 'w-1 h-1',
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  }[size] ?? 'w-2 h-2';

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={`${dot} rounded-full bg-current animate-typingBounce`} style={{ animationDelay: '0s' }} />
      <span className={`${dot} rounded-full bg-current animate-typingBounce`} style={{ animationDelay: '0.15s' }} />
      <span className={`${dot} rounded-full bg-current animate-typingBounce`} style={{ animationDelay: '0.3s' }} />
    </span>
  );
};

export default ThreeDots;
