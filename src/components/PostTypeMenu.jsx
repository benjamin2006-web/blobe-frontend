import { useState } from 'react';
import { ChevronLeft, CircleDashed, Image, LayoutDashboard, X } from 'lucide-react';

const OPTIONS = [
  { type: 'photo', label: 'Photo post', Icon: Image },
  { type: 'board', label: 'Board post', Icon: LayoutDashboard },
  { type: 'story', label: 'Story', Icon: CircleDashed },
];

const STORY_OPTIONS = [
  { type: 'photoStory', label: 'Photo story', Icon: Image },
  { type: 'boardStory', label: 'Board story', Icon: LayoutDashboard },
];

const PostTypeMenu = ({ onClose, onSelect }) => {
  const [storyOptionsOpen, setStoryOptionsOpen] = useState(false);
  const options = storyOptionsOpen ? STORY_OPTIONS : OPTIONS;

  return (
    <>
    <button
      type='button'
      aria-label='Close post type menu'
      onClick={onClose}
      className='fixed inset-0 z-[55] cursor-default bg-black/60 outline-none backdrop-blur-sm focus:outline-none'
    />
    <div
      role='dialog'
      aria-modal='true'
      aria-label={storyOptionsOpen ? 'Choose story type' : 'Choose post type'}
      className='fixed inset-x-4 bottom-20 z-[60] mx-auto flex w-fit items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0f]/90 px-3 py-2 text-white backdrop-blur-2xl animate-fade-in-up md:bottom-auto md:top-1/2 md:-translate-y-1/2'
    >
      {storyOptionsOpen && (
        <button
          type='button'
          aria-label='Back to post types'
          title='Back'
          onClick={() => setStoryOptionsOpen(false)}
          className='flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-gray-300 outline-none transition hover:bg-white/[0.14] hover:text-white focus:outline-none'
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {options.map(({ type, label, Icon }) => (
        <button
          key={type}
          type='button'
          aria-label={label}
          title={label}
          onClick={() => {
            if (type === 'story') {
              setStoryOptionsOpen(true);
            } else {
              onSelect(type);
            }
          }}
          className='flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.08] text-white outline-none transition hover:bg-white/[0.14] focus:outline-none active:scale-[0.97] sm:w-20'
        >
          <Icon size={20} strokeWidth={2.6} className='text-white' />
          <span className='text-xs font-bold leading-none text-white'>
            {label.replace(' post', '').replace(' story', '')}
          </span>
        </button>
      ))}
      <button
        type='button'
        aria-label='Close post type menu'
        onClick={onClose}
        className='group flex h-12 w-8 items-center justify-center text-gray-400 outline-none transition-colors duration-200 hover:text-white focus:outline-none'
      >
        <X size={18} strokeWidth={2.8} className='transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-90 group-hover:scale-125 group-active:rotate-180 group-active:scale-75' />
      </button>
    </div>
    </>
  );
};

export default PostTypeMenu;