import { Radio, X, Users } from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import UserAvatar from './UserAvatar';

const MeetingInviteBanner = ({ invitations, onJoin, onDismiss }) => {
  if (!invitations || invitations.length === 0) return null;

  return (
    <div className='fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 max-w-md w-full px-4'>
      {invitations.map((invite) => (
        <div
          key={invite.meetingId}
          className='flex items-center gap-3 bg-indigo-900/95 border border-indigo-500/30 rounded-xl px-4 py-3 shadow-lg shadow-indigo-500/20 animate-slide-up backdrop-blur-sm'
        >
          {/* Host avatar */}
          <UserAvatar
            user={invite.host || { _id: invite.hostId, username: invite.hostName }}
            src={invite.hostAvatar || getAvatarUrl({ username: invite.hostName })}
            alt={invite.hostName}
            className='h-9 w-9 rounded-full border-2 border-indigo-400/50 flex-shrink-0'
          />

          {/* Message content */}
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2'>
              <Radio className='h-4 w-4 text-indigo-400 flex-shrink-0' />
              <span className='text-sm font-medium text-indigo-100'>
                <span className='font-semibold'>{invite.hostName || 'A group member'}</span>{' '}
                started a group meeting
              </span>
            </div>
            <p className='text-xs text-indigo-300/80 mt-0.5 truncate'>
              in {invite.group?.name || 'this group'}
            </p>
          </div>

          {/* Actions */}
          <div className='flex items-center gap-1 flex-shrink-0'>
            <button
              onClick={() => onJoin(invite)}
              className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors'
            >
              <Users className='h-3.5 w-3.5' />
              Join
            </button>
            <button
              onClick={() => onDismiss(invite.meetingId)}
              className='flex items-center gap-1 px-2 py-1.5 text-xs text-indigo-200 hover:text-white hover:bg-indigo-500/30 rounded-lg transition-colors'
              aria-label='Decline group meeting invitation'
            >
              <X className='h-3.5 w-3.5' />
              Not now
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MeetingInviteBanner;