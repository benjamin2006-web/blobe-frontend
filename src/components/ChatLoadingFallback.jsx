const ConversationSkeleton = () => (
  <div className='flex items-center gap-3 rounded-2xl px-3 py-3'>
    <div className='h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/10' />
    <div className='min-w-0 flex-1 space-y-2'>
      <div className='h-3 w-2/5 animate-pulse rounded-full bg-white/10' />
      <div className='h-2.5 w-3/4 animate-pulse rounded-full bg-white/10' />
    </div>
  </div>
);

const ChatLoadingFallback = () => (
  <main
    className='fixed inset-0 flex flex-col overflow-hidden bg-gray-950 text-white'
    role='status'
    aria-label='Loading messages'
  >
    <header className='flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-gray-900/80 px-4'>
      <div className='flex items-center gap-3'>
        <div className='h-9 w-9 animate-pulse rounded-xl bg-white/10' />
        <div className='h-4 w-20 animate-pulse rounded-full bg-white/10' />
      </div>
      <div className='h-9 w-9 animate-pulse rounded-full bg-white/10' />
    </header>

    <div className='flex min-h-0 flex-1'>
      <section className='flex min-h-0 w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-white/10'>
        <div className='space-y-4 border-b border-white/10 p-4'>
          <div className='h-5 w-28 animate-pulse rounded-full bg-white/10' />
          <div className='h-10 animate-pulse rounded-xl bg-white/10' />
          <div className='flex gap-2'>
            <div className='h-8 flex-1 animate-pulse rounded-lg bg-white/10' />
            <div className='h-8 flex-1 animate-pulse rounded-lg bg-white/10' />
          </div>
        </div>
        <div className='min-h-0 flex-1 overflow-hidden p-2'>
          {Array.from({ length: 7 }, (_, index) => (
            <ConversationSkeleton key={index} />
          ))}
        </div>
      </section>

      <section className='hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 md:flex'>
        <div className='h-16 w-16 animate-pulse rounded-full bg-white/10' />
        <div className='h-4 w-40 animate-pulse rounded-full bg-white/10' />
        <div className='h-3 w-56 animate-pulse rounded-full bg-white/10' />
      </section>
    </div>

    <nav
      aria-hidden='true'
      className='flex h-14 shrink-0 items-center justify-around border-t border-white/10 bg-gray-900/90 md:hidden'
    >
      <div className='h-6 w-6 animate-pulse rounded-md bg-white/10' />
      <div className='h-6 w-6 animate-pulse rounded-md bg-white/10' />
      <div className='h-6 w-6 animate-pulse rounded-md bg-white/10' />
    </nav>
  </main>
);

export default ChatLoadingFallback;
