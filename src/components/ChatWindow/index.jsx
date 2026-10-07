import { useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import {
  DEFAULT_WALLPAPER_DESKTOP,
  DEFAULT_WALLPAPER_MOBILE,
  useWallpaper,
} from '../../hooks/useWallpaper';
import ChatHeader from './ChatHeader';
import ChatInput from './ChatInput';
import ChatMessages from './ChatMessages';
import GroupChatHeader from './GroupChatHeader';

const WallpaperBackground = ({ wallpaper }) => {
  if (wallpaper) {
    return (
      <div
        aria-hidden='true'
        className='absolute inset-0 bg-cover bg-center bg-no-repeat'
        style={{ backgroundImage: `url("${wallpaper}")` }}
      />
    );
  }

  return (
    <>
      <div
        aria-hidden='true'
        className='absolute inset-0 hidden bg-cover bg-center bg-no-repeat md:block'
        style={{ backgroundImage: `url("${DEFAULT_WALLPAPER_DESKTOP}")` }}
      />
      <div
        aria-hidden='true'
        className='absolute inset-0 bg-cover bg-center bg-no-repeat md:hidden'
        style={{ backgroundImage: `url("${DEFAULT_WALLPAPER_MOBILE}")` }}
      />
    </>
  );
};

const ChatWindow = ({
  onBack,
  // DM props
  selectedUser,
  loadingMessages,
  hasMoreMessages,
  loadingMoreMessages,
  onLoadMoreMessages,
  messages,
  setMessages,
  currentUser,
  onSendMessage,
  isUserOnline,
  isUserTyping,
  isUserRecording,
  groupRecordingUsers,
  onTyping,
  onMessageUpdate,
  onMessageDelete,
  onMessageHide,
  onUserBlocked,
  onUserMuted,
  onChatDeleted,
  onRefreshUsers,
  onStartCall,
  onStartMeet,
  socket: socketProp,
  // Group props
  selectedGroup,
  groupMessages,
  setGroupMessages,
  onSendGroupMessage,
  groupTypingUsers,
  onGroupTyping,
  onGroupUpdated,
  onGroupLeft,
  onGroupDeleted,
  // Forward
  users,
  groups,
  lastMessages,
  groupLastMessages,
  onForwardMessage,
  // Optimistic media (photos & voice notes)
  onSendMediaMessage,
  onRetryUpload,
  onDiscardUpload,
  targetMessageId,
  isConversationVisible,
}) => {
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const { socket } = useSocket();
  const { wallpaper } = useWallpaper();

  const isGroupChat = !!selectedGroup && !selectedUser;
  const activeMessages = isGroupChat ? groupMessages : messages;
  const setActiveMessages = isGroupChat ? setGroupMessages : setMessages;
  const currentUserId = String(currentUser?._id || currentUser?.id || '');
  const selectedUserId = String(selectedUser?._id || '');
  const hasExistingConversation = messages.some((message) => {
    const senderId = String(message.sender?._id || message.sender || '');
    const receiverId = String(message.receiver?._id || message.receiver || '');
    const isConversationMessage =
      message.messageType !== 'call' &&
      message.messageType !== 'meeting' &&
      !message.isDeleted;
    return (
      isConversationMessage &&
      ((senderId === currentUserId && receiverId === selectedUserId) ||
        (senderId === selectedUserId && receiverId === currentUserId))
    );
  });
  const waitingForPrivateConversation =
    !isGroupChat &&
    selectedUser?.isPrivate &&
    !loadingMessages &&
    !hasExistingConversation;
  const canCallSelectedUser =
    !selectedUser?.isPrivate || (!loadingMessages && hasExistingConversation);

  if (!selectedUser && !selectedGroup) {
    return (
      <div className='relative flex-1 overflow-hidden'>
        <WallpaperBackground wallpaper={wallpaper} />
      </div>
    );
  }

  const handleTypingStart = () => {
    if (isGroupChat) {
      if (selectedGroup) onGroupTyping?.(selectedGroup._id, true);
    } else {
      if (selectedUser) onTyping?.(selectedUser._id, true);
    }
  };

  const handleTypingStop = () => {
    if (isGroupChat) onGroupTyping?.(selectedGroup?._id, false);
    else onTyping?.(selectedUser?._id, false);
  };

  const handleReplyMessage = (message) => setReplyTo(message);
  const handleCancelReply = () => setReplyTo(null);
  const handleStartEditMessage = (message) => {
    setReplyTo(null);
    setEditingMessage(message);
  };
  const handleCancelEditMessage = () => setEditingMessage(null);

  const handleEditMessage = (message, content) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !message?._id) return;

    socket?.emit('edit_message', {
      messageId: message._id,
      content: trimmedContent,
    });
    setEditingMessage(null);
  };

  const handleSendReply = (content) => {
    if (!replyTo || !content.trim()) return;
    if (isGroupChat) {
      onSendGroupMessage?.(content.trim());
    } else if (socket) {
      socket.emit('reply_message', {
        messageId: replyTo._id,
        content: content.trim(),
      });
    }
    setReplyTo(null);
  };

  const chatTarget = isGroupChat
    ? { ...selectedGroup, isGroup: true }
    : selectedUser;

  return (
    <div className='relative flex-1 flex flex-col min-h-0 overflow-hidden'>
      <WallpaperBackground wallpaper={wallpaper} />
      <div className='relative z-10 flex flex-1 flex-col min-h-0 overflow-hidden'>
        {/* Header */}
        <div className='h-[66px] flex-shrink-0 md:h-auto'>
          {isGroupChat ? (
            <GroupChatHeader
              selectedGroup={selectedGroup}
              groupTypingUsers={groupTypingUsers}
              currentUser={currentUser}
              onGroupUpdated={onGroupUpdated}
              onGroupLeft={onGroupLeft}
              onGroupDeleted={onGroupDeleted}
              onBack={onBack}
              isUserOnline={isUserOnline}
              onStartMeet={onStartMeet}
            />
          ) : (
            <ChatHeader
              selectedUser={selectedUser}
              isUserOnline={isUserOnline}
              isUserTyping={isUserTyping}
              onShowInfo={() => {}}
              onUserBlocked={onUserBlocked}
              onUserMuted={onUserMuted}
              onChatDeleted={onChatDeleted}
              onRefreshUsers={onRefreshUsers}
              onBack={onBack}
              onStartCall={canCallSelectedUser ? onStartCall : undefined}
              showCallActions={canCallSelectedUser}
            />
          )}
        </div>

        {/* Messages */}
        <ChatMessages
          messages={activeMessages}
          setMessages={setActiveMessages}
          currentUser={currentUser}
          selectedUser={isGroupChat ? null : selectedUser}
          selectedGroup={isGroupChat ? selectedGroup : null}
          isGroupChat={isGroupChat}
          isConversationVisible={isConversationVisible}
          isUserTyping={isGroupChat ? undefined : isUserTyping}
          isUserRecording={isGroupChat ? undefined : isUserRecording}
          groupTypingUsers={isGroupChat ? groupTypingUsers : undefined}
          groupRecordingUsers={isGroupChat ? groupRecordingUsers : undefined}
          onMessageUpdate={onMessageUpdate}
          onMessageDelete={onMessageDelete}
          onMessageHide={onMessageHide}
          onReplyMessage={handleReplyMessage}
          editingMessage={editingMessage}
          onStartEditMessage={handleStartEditMessage}
          onStartCall={
            isGroupChat || canCallSelectedUser ? onStartCall : undefined
          }
          users={users}
          groups={groups}
          lastMessages={lastMessages}
          groupLastMessages={groupLastMessages}
          onForwardMessage={onForwardMessage}
          onRetryUpload={onRetryUpload}
          onDiscardUpload={onDiscardUpload}
          targetMessageId={targetMessageId}
          loadingMessages={isGroupChat ? false : loadingMessages}
          hasMore={isGroupChat ? false : hasMoreMessages}
          loadingMore={isGroupChat ? false : loadingMoreMessages}
          onLoadMore={isGroupChat ? undefined : onLoadMoreMessages}
        />

        {/* Input */}
        {waitingForPrivateConversation ? (
          <div className='safe-bottom border-t border-white/10 bg-gray-900/90 px-4 py-4 text-center backdrop-blur-xl'>
            <p className='text-sm font-medium text-gray-200'>
              This is a private account.
            </p>
            <p className='mt-1 text-xs text-gray-400'>
              You can chat here after they start a conversation with you.
            </p>
            <p className='mt-1 text-xs text-gray-400'>
              You can call after they start a conversation with you.
            </p>
          </div>
        ) : (
          <ChatInput
            key={editingMessage?._id || 'composer'}
            onSendMessage={isGroupChat ? onSendGroupMessage : onSendMessage}
            onSendMediaMessage={onSendMediaMessage}
            selectedUser={isGroupChat ? chatTarget : selectedUser}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            replyTo={replyTo}
            onCancelReply={handleCancelReply}
            onSendReply={handleSendReply}
            editingMessage={editingMessage}
            onEditMessage={handleEditMessage}
            onCancelEdit={handleCancelEditMessage}
          />
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
