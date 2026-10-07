/** Build a sidebar preview entry from a message document */
export const toConversationPreview = (
  message,
  currentUserId,
  messageCount = 0,
) => {
  const senderId = String(message.sender?._id ?? message.sender);
  const myId = String(currentUserId);
  const isImage = message.messageType === 'image';
  const isVoice = message.messageType === 'voice';
  const isCall = message.messageType === 'call';
  return {
    messageId: String(message._id || message.clientId || ''),
    content: isImage
      ? '📷 Photo'
      : message.messageType === 'file'
        ? `📎 ${message.fileName || 'File'}`
        : message.messageType === 'location'
          ? '📍 Shared location'
          : isVoice
            ? '🎤 Voice message'
            : isCall
              ? `📞 ${message.callType === 'video' ? 'Video call' : 'Voice call'}`
              : message.content,
    timestamp: message.createdAt || new Date().toISOString(),
    senderId,
    isFromMe: senderId === myId,
    status: message.status || 'sent',
    messageCount,
  };
};

/** Other participant id in a 1:1 message */
export const getConversationPartnerId = (message, currentUserId) => {
  const senderId = String(message.sender?._id ?? message.sender);
  const receiverId = String(message.receiver?._id ?? message.receiver);
  const myId = String(currentUserId);
  return senderId === myId ? receiverId : senderId;
};

/**
 * Recent chat activity wins first. Recommendation score remains a tie-breaker
 * for users with the same message activity.
 */
export const sortUsersByLastMessage = (users, lastMessages) => {
  return [...users].sort((a, b) => {
    const lastA = lastMessages?.[String(a._id)];
    const lastB = lastMessages?.[String(b._id)];
    const timeA = lastA?.timestamp ? new Date(lastA.timestamp).getTime() : 0;
    const timeB = lastB?.timestamp ? new Date(lastB.timestamp).getTime() : 0;

    if (timeA !== timeB) {
      return timeB - timeA;
    }

    const scoreA = Number(a?.score ?? 0);
    const scoreB = Number(b?.score ?? 0);
    if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    return (a.username || '').localeCompare(b.username || '', undefined, {
      sensitivity: 'base',
    });
  });
};

/** Format last message preview text */
export const formatLastMessagePreview = (message, currentUserId) => {
  if (!message) return 'No messages yet';

  const isFromMe = message.senderId === currentUserId || message.isFromMe;
  const maxLength = 30;
  let content = message.content || '';

  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '...';
  }

  return content;
};

/** Get time ago string from timestamp */
export const getTimeAgo = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
};

/** Check if user has unread messages */
export const hasUnreadMessages = (lastMessage, currentUserId) => {
  if (!lastMessage) return false;
  const isFromMe =
    lastMessage.senderId === currentUserId || lastMessage.isFromMe;
  return !isFromMe && lastMessage.status !== 'read';
};

/** Update conversation previews with a new message */
export const updateConversationPreviews = (
  prevPreviews,
  message,
  currentUserId,
) => {
  const partnerId = getConversationPartnerId(message, currentUserId);
  const newPreview = toConversationPreview(message, currentUserId);

  return {
    ...prevPreviews,
    [partnerId]: newPreview,
  };
};
