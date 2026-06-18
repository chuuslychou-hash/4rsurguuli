import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  doc, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  MessageSquare, 
  Send, 
  Plus, 
  Users, 
  Search, 
  X, 
  Check, 
  Hash, 
  User as UserIcon, 
  MessageCircle, 
  Info,
  ChevronRight,
  Sparkles,
  School,
  Pencil,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const maskRealName = (nameToMask: string): string => {
  return nameToMask || '';
};

const maskUsername = (username?: string): string => {
  return username || '';
};

interface ChatSystemProps {
  user: {
    username: string;
    realName?: string;
    role: 'teacher' | 'student';
    schoolCode: string;
    grade?: string;
    section?: string;
  };
}

export function ChatSystem({ user }: ChatSystemProps) {
  const getDisplayUserProperties = (u: any) => {
    if (!u) return { realName: '', username: '', displayName: '' };
    const isSelf = u.username === user.username;
    
    const plainRealName = u.realName || '';
    const plainUsername = u.username || '';
    
    return {
      realName: plainRealName,
      username: isSelf ? plainUsername : '', // Hide other people's login username completely
      displayName: plainRealName || (isSelf ? plainUsername : 'Сурагч')
    };
  };

  const getDisplaySenderName = (senderUsername: string, senderName: string) => {
    const isSelf = senderUsername === user.username;
    if (isSelf) return user.realName || user.username;
    const foundUser = allUsers.find(u => u.username === senderUsername);
    if (foundUser) {
      return foundUser.realName || (foundUser.role === 'teacher' ? 'Багш' : 'Сурагч');
    }
    const isEnglishOnly = /^[a-zA-Z0-9_.-]+$/.test(senderName.trim());
    if (isEnglishOnly) {
      return 'Сурагч';
    }
    return senderName;
  };

  // Sidebar states
  const [activeTab, setActiveTab] = useState<'dm' | 'group'>('dm');
  const [rooms, setRooms] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected chat room states
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);
  const [viewReactionsData, setViewReactionsData] = useState<{
    emoji: string;
    users: string[];
  } | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);

  const handleStartEdit = (messageId: string, text: string) => {
    setActiveReactionPickerMessageId(null);
    setEditingMessageId(messageId);
    setEditingText(text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editingText.trim()) return;
    try {
      const msgRef = doc(db, 'chat_messages', messageId);
      await updateDoc(msgRef, {
        text: editingText.trim(),
        isEdited: true,
        editedAt: serverTimestamp()
      });
      setEditingMessageId(null);
      setEditingText('');
    } catch (err) {
      console.error("Error editing message:", err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      setDeleteConfirmMessageId(null);
      setActiveReactionPickerMessageId(null);
      await deleteDoc(doc(db, 'chat_messages', messageId));
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  };

  const longPressTimeoutRef = useRef<Record<string, any>>({});

  const handlePressStart = (messageId: string) => {
    if (longPressTimeoutRef.current[messageId]) {
      clearTimeout(longPressTimeoutRef.current[messageId]);
    }
    longPressTimeoutRef.current[messageId] = setTimeout(() => {
      setActiveReactionPickerMessageId(messageId);
    }, 600);
  };

  const handlePressEnd = (messageId: string) => {
    if (longPressTimeoutRef.current[messageId]) {
      clearTimeout(longPressTimeoutRef.current[messageId]);
    }
  };

  // Modals
  const [isDMModalOpen, setIsDMModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // Group creation states
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]); // Usernames
  const [autoClassGrade, setAutoClassGrade] = useState(user.grade || '11');
  const [autoClassSection, setAutoClassSection] = useState(user.section || 'А');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Synchronize Chat Rooms the user is a member of
  useEffect(() => {
    if (!user.username) return;

    const q = query(
      collection(db, 'chat_rooms'),
      where('members', 'array-contains', user.username)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomList = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as any));

      // Client-side sort by lastMessageAt desc to guarantee zero firestore index issues
      roomList.sort((a, b) => {
        const timeA = a.lastMessageAt?.seconds || 0;
        const timeB = b.lastMessageAt?.seconds || 0;
        return timeB - timeA;
      });

      setRooms(roomList);
    }, (error) => {
      console.error("Error subscribing to chat rooms:", error);
      handleFirestoreError(error, OperationType.GET, 'chat_rooms');
    });

    return () => unsubscribe();
  }, [user.username]);

  // If a room is selected, keep its messages synchronized
  useEffect(() => {
    if (!selectedRoom?.id) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    const q = query(
      collection(db, 'chat_messages'),
      where('roomId', '==', selectedRoom.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as any));

      // Client-side sort by createdAt asc
      msgList.sort((a, b) => {
        const timeA = (a.createdAt?.seconds || 0) * 1000 + (a.createdAt?.nanoseconds || 0) / 1000000;
        const timeB = (b.createdAt?.seconds || 0) * 1000 + (b.createdAt?.nanoseconds || 0) / 1000000;
        return timeA - timeB;
      });

      setMessages(msgList);
      setIsLoadingMessages(false);
      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (error) => {
      console.error("Error loading chat messages:", error);
      setIsLoadingMessages(false);
      handleFirestoreError(error, OperationType.GET, `chat_messages/${selectedRoom.id}`);
    });

    return () => unsubscribe();
  }, [selectedRoom?.id]);

  // Load all system users on the site for direct messaging and group creations
  useEffect(() => {
    const q = query(
      collection(db, 'users')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as any))
        .filter(u => u.username !== user.username); // exclude self
      
      setAllUsers(userList);
    }, (error) => {
      console.error("Error loading all users:", error);
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsubscribe();
  }, [user.username]);

  // Update seenBy status for messages in selectedRoom
  useEffect(() => {
    if (!selectedRoom?.id || !messages.length) return;

    // Filter messages sent by others that don't have our username in seenBy
    const unseenMsg = messages.filter(msg => 
      msg.senderUsername !== user.username && 
      (!msg.seenBy || !msg.seenBy.includes(user.username))
    );

    if (unseenMsg.length > 0) {
      unseenMsg.forEach(async (msg) => {
        try {
          const msgRef = doc(db, 'chat_messages', msg.id);
          const currentSeen = msg.seenBy || [];
          if (!currentSeen.includes(user.username)) {
            await updateDoc(msgRef, {
              seenBy: [...currentSeen, user.username]
            });
          }
        } catch (err) {
          console.error("Error marking message as seen:", err);
        }
      });
    }
  }, [messages, selectedRoom?.id, user.username]);

  // Toggle reaction on a message (one reaction per user per message)
  const handleToggleReaction = async (messageId: string, emoji: string, currentReactions: any) => {
    try {
      setActiveReactionPickerMessageId(null);
      const msgRef = doc(db, 'chat_messages', messageId);
      const updated = { ...(currentReactions || {}) };
      
      // Check if user already had this specific emoji active
      const hadTargetEmoji = (updated[emoji] || []).includes(user.username);

      // Remove current user from all existing emoji lists
      Object.keys(updated).forEach(key => {
        if (updated[key]) {
          updated[key] = updated[key].filter((u: string) => u !== user.username);
          if (updated[key].length === 0) {
            delete updated[key];
          }
        }
      });

      // If the user did not have this specific emoji, add it now
      if (!hadTargetEmoji) {
        updated[emoji] = [...(updated[emoji] || []), user.username];
      }

      await updateDoc(msgRef, { reactions: updated });
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedRoom) return;

    const textToSend = messageText;
    setMessageText('');

    try {
      const messagePayload = {
        roomId: selectedRoom.id,
        senderUsername: user.username,
        senderName: user.realName || user.username,
        senderRole: user.role,
        text: textToSend,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'chat_messages'), messagePayload);

      // Update room lastMessage metadata
      const roomRef = doc(db, 'chat_rooms', selectedRoom.id);
      await updateDoc(roomRef, {
        lastMessage: textToSend,
        lastMessageAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending message:", err);
      handleFirestoreError(err, OperationType.WRITE, `chat_messages/${selectedRoom.id}`);
    }
  };

  // Switch or initiate Direct Message with user
  const handleStartDM = async (targetUser: any) => {
    setIsDMModalOpen(false);

    // Check if room already exists
    const existingRoom = rooms.find(r => 
      r.type === 'direct' && 
      r.members.includes(user.username) && 
      r.members.includes(targetUser.username)
    );

    if (existingRoom) {
      setSelectedRoom(existingRoom);
      return;
    }

    try {
      // Create new DM room
      const roomPayload = {
        type: 'direct',
        schoolCode: user.schoolCode,
        members: [user.username, targetUser.username],
        createdBy: user.username,
        createdAt: serverTimestamp(),
        name: `${targetUser.realName || targetUser.username}`,
        lastMessage: 'Яриа эхэллээ',
        lastMessageAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'chat_rooms'), roomPayload);
      setSelectedRoom({ id: docRef.id, ...roomPayload });
    } catch (err) {
      console.error("Error creating direct message room:", err);
      handleFirestoreError(err, OperationType.CREATE, 'chat_rooms');
    }
  };

  // Create customized or classroom group chat
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || user.role === 'student') return;

    try {
      const roomPayload = {
        type: 'group',
        name: newGroupName,
        schoolCode: user.schoolCode,
        members: [user.username, ...selectedGroupMembers],
        createdBy: user.username,
        createdAt: serverTimestamp(),
        lastMessage: `${user.realName || user.username} групп чат үүсгэлээ`,
        lastMessageAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'chat_rooms'), roomPayload);
      setSelectedRoom({ id: docRef.id, ...roomPayload });
      
      // Reset group form
      setNewGroupName('');
      setSelectedGroupMembers([]);
      setIsGroupModalOpen(false);
    } catch (err) {
      console.error("Error creating group chat room:", err);
      handleFirestoreError(err, OperationType.CREATE, 'chat_rooms');
    }
  };

  // Populate whole class students to members for group creation
  const handleAutoAddClassStudents = () => {
    const classStudents = allUsers.filter(u => 
      u.role === 'student' && 
      u.grade === autoClassGrade && 
      u.section === autoClassSection
    );
    
    const usernamesToAdd = classStudents.map(u => u.username);
    // Merge without duplicates
    const combined = Array.from(new Set([...selectedGroupMembers, ...usernamesToAdd]));
    setSelectedGroupMembers(combined);
  };

  // Helper to format user role name
  const formatRole = (role: string) => {
    return role === 'teacher' ? 'Багш' : 'Сурагч';
  };

  // Filter list of users (Strictly match words of realName starting with query, including role and usernames)
  const filteredDMUsers = allUsers.filter(u => {
    if (!dmSearchQuery) return true;
    const query = dmSearchQuery.trim().toLowerCase();
    const realName = (u.realName || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const roleMongolian = u.role === 'teacher' ? 'багш' : 'сурагч';

    // Word-based starts-with matching on real name
    const nameWords = realName.split(/[\s.]+/);
    const matchesName = nameWords.some(word => word.startsWith(query)) || realName.startsWith(query);
    const matchesUsername = username.startsWith(query);
    const matchesRole = roleMongolian.startsWith(query) || u.role.startsWith(query);

    return matchesName || matchesUsername || matchesRole;
  });

  const filteredGroupUsers = allUsers.filter(u => {
    if (!groupSearchQuery) return true;
    const query = groupSearchQuery.trim().toLowerCase();
    const realName = (u.realName || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const roleMongolian = u.role === 'teacher' ? 'багш' : 'сурагч';

    const nameWords = realName.split(/[\s.]+/);
    const matchesName = nameWords.some(word => word.startsWith(query)) || realName.startsWith(query);
    const matchesUsername = username.startsWith(query);
    const matchesRole = roleMongolian.startsWith(query) || u.role.startsWith(query);

    return matchesName || matchesUsername || matchesRole;
  });

  // Filter school users active on platform for DM starting
  const sidebarUsers = allUsers.filter(u => {
    // Keep users visible in 'People to chat with' list even if direct room already exists to prevent blank screens and ensure easy navigation
    if (searchQuery) {
      const query = searchQuery.trim().toLowerCase();
      const realName = (u.realName || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      const roleMongolian = u.role === 'teacher' ? 'багш' : 'сурагч';
      
      const nameWords = realName.split(/[\s.]+/);
      const matchesName = nameWords.some(word => word.startsWith(query)) || realName.startsWith(query);
      const matchesUsername = username.startsWith(query);
      const matchesRole = roleMongolian.startsWith(query) || u.role.startsWith(query);

      return matchesName || matchesUsername || matchesRole;
    }
    return true;
  });

  // Filter existing rooms based on tab
  const filteredRooms = rooms.filter(r => {
    if (activeTab === 'dm' && r.type !== 'direct') return false;
    if (activeTab === 'group' && r.type !== 'group') return false;

    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      if (r.type === 'group') {
        return r.name.toLowerCase().includes(term);
      } else {
        // DM room name needs dynamic lookup if stored name is stale, or we just look up the members' names
        const otherUsername = r.members.find((m: string) => m !== user.username);
        const otherUserObj = allUsers.find(u => u.username === otherUsername);
        const dispProps = getDisplayUserProperties(otherUserObj || { username: otherUsername, role: 'student' });
        const displayName = dispProps.displayName;
        return displayName.toLowerCase().includes(term);
      }
    }
    return true;
  });

  return (
    <div id="chat-system" className="h-[calc(100vh-12rem)] min-h-[450px] flex rounded-3xl bg-white border border-slate-100 shadow-xl overflow-hidden font-sans">
      
      {/* 2. Left side: Chat List & Rooms Subpanel */}
      <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/50 flex-shrink-0">
        
        {/* Chat List Header */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <MessageSquare size={18} />
              </span>
              <h3 className="font-bold text-slate-800 text-sm">Сургалтын Чат</h3>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDMModalOpen(true)}
                className="p-1.5 hover:bg-slate-100 text-indigo-600 rounded-lg transition-colors cursor-pointer"
                title="Шинэ чат"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
            <button
              onClick={() => setActiveTab('dm')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'dm' ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-slate-800'
              }`}
            >
              Хүмүүстэй чатлах
            </button>
            <button
              onClick={() => setActiveTab('group')}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'group' ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-slate-800'
              }`}
            >
              Бүлэг / Ангиуд
            </button>
          </div>

          {/* Search Contacts in Rooms */}
          <div className="relative">
            <Search size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
            <input
              type="text"
              placeholder="Чат хайх..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Room items view */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {activeTab === 'dm' ? (
            <>
              {/* Only the users list to chat with (as requested: "idevhtei hariltsaa gesen zuil hereggui22 zuvhun chatlah humusni heregtei") */}
              {sidebarUsers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-slate-400 px-3 py-1 select-none uppercase tracking-wider">Чатлах сурагч, багш нар</p>
                  {sidebarUsers.map((u) => {
                    const isSelected = selectedRoom?.type === 'direct' && selectedRoom.members.includes(u.username);
                    // Find if a direct chat room already exists with this user
                    const associatedRoom = rooms.find(r => 
                      r.type === 'direct' && 
                      r.members.includes(user.username) && 
                      r.members.includes(u.username)
                    );

                    return (
                      <button
                        type="button"
                        key={u.username}
                        onClick={() => handleStartDM(u)}
                        className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                            : 'hover:bg-slate-100 text-slate-700 bg-white/40'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full rounded-tr-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : u.role === 'teacher'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-violet-100 text-violet-800'
                        }`}>
                          {getDisplayUserProperties(u).displayName.charAt(0)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-xs truncate max-w-[130px] flex items-center gap-1.5">
                              <span className="truncate">{getDisplayUserProperties(u).displayName}</span>
                              {u.role === 'student' && u.hasGoldBadge && (
                                <span className="inline-flex items-center text-amber-550 select-none flex-shrink-0 animate-pulse font-bold" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                                  🏆
                                </span>
                              )}
                            </h4>
                            <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : u.role === 'teacher'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-violet-50 text-violet-700 border border-violet-200'
                            }`}>
                              {formatRole(u.role)}
                            </span>
                          </div>
                          
                          <p className={`text-[10px] truncate mt-1 ${isSelected ? 'text-white/80' : 'text-slate-400 font-semibold'}`}>
                            {associatedRoom?.lastMessage 
                              ? associatedRoom.lastMessage 
                              : (u.grade && u.section ? `${u.grade}${u.section}-р анги` : 'Яриа эхлээгүй')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {sidebarUsers.length === 0 && (
                <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-4 space-y-2 text-center select-none animate-fade-in">
                  <MessageCircle size={24} className="text-slate-300" />
                  <p className="text-[11px] font-medium font-sans">
                    Чатлах хэрэглэгч арай олдсонгүй.
                  </p>
                </div>
              )}
            </>
          ) : (
            filteredRooms.length > 0 ? (
              filteredRooms.map((room) => {
                const isSelected = selectedRoom?.id === room.id;
                
                return (
                  <button
                    type="button"
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all cursor-pointer select-none ${
                      isSelected 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full rounded-tr-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
                      isSelected 
                        ? 'bg-white/20 text-white' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      <Users size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-xs truncate max-w-[130px]">
                          {room.name}
                        </h4>
                      </div>
                      
                      <p className={`text-[10px] truncate mt-1 ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                        {room.lastMessage || 'Яриа хоосон'}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-4 space-y-2 text-center select-none">
                <MessageCircle size={24} className="text-slate-300" />
                <p className="text-[11px] font-medium font-sans">
                  Одоогоор идэвхтэй групп чат байхгүй байна.
                </p>
                {user.role === 'student' ? (
                  <p className="text-[10px] text-slate-400 mt-2 italic">Групп чатыг зөвхөн багш үүсгэх эрхтэй.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsGroupModalOpen(true)}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold transition-all cursor-pointer mt-1"
                  >
                    Шинэ групп чат үүсгэх
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {/* Create Group Quick Banner */}
        {activeTab === 'group' && filteredRooms.length > 0 && (
          user.role === 'student' ? (
            <div className="p-3 bg-white border-t border-slate-100 text-center select-none">
              <span className="text-[10px] text-slate-400 italic">Групп чатыг зөвхөн багш үүсгэх эрхтэй.</span>
            </div>
          ) : (
            <div className="p-3 bg-white border-t border-slate-100">
              <button
                onClick={() => setIsGroupModalOpen(true)}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} />
                Групп чат үүсгэх
              </button>
            </div>
          )
        )}
      </div>

      {/* 3. Right side: Active Messages Panel */}
      <div className="flex-1 flex flex-col bg-slate-50/20">
        {selectedRoom ? (
          <>
            {/* Active Chat Header */}
            <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shadow-xs relative z-10">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-indigo-700 bg-indigo-50`}>
                  {selectedRoom.type === 'group' ? (
                    <Users size={18} />
                  ) : (
                    (selectedRoom.members.find((m: string) => m !== user.username) || 'C').charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">
                    {selectedRoom.type === 'group' 
                      ? selectedRoom.name 
                      : (() => {
                          const otherUsername = selectedRoom.members.find((m: string) => m !== user.username);
                          const otherUserObj = allUsers.find(u => u.username === otherUsername);
                          return getDisplayUserProperties(otherUserObj || { username: otherUsername, role: 'student' }).displayName;
                        })()
                    }
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium font-mono">
                    {selectedRoom.type === 'group' 
                      ? `Групп чат • ${selectedRoom.members.length} гишүүнтэй` 
                      : `${formatRole(allUsers.find(u => u.username === selectedRoom.members.find((m: string) => m !== user.username))?.role || '')}`
                    }
                  </span>
                </div>
              </div>

              {/* General Group Info */}
              {selectedRoom.type === 'group' && (
                <div className="flex items-center gap-1 text-slate-400 text-xs px-2.5 py-1 bg-slate-50 rounded-lg">
                  <Info size={14} />
                  <span className="font-medium text-[10px] truncate max-w-[120px]" title={selectedRoom.members.map((m: string) => {
                    const otherUserObj = allUsers.find(u => u.username === m);
                    return getDisplayUserProperties(otherUserObj || { username: m, role: 'student' }).displayName;
                  }).join(', ')}>
                    {selectedRoom.members.map((m: string) => {
                      const otherUserObj = allUsers.find(u => u.username === m);
                      return getDisplayUserProperties(otherUserObj || { username: m, role: 'student' }).displayName;
                    }).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
              {isLoadingMessages ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2" />
                  <span className="text-xs">Чатыг ачаалж байна...</span>
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg, index) => {
                  const isMyMessage = msg.senderUsername === user.username;
                  
                  // Clean dynamic timestamp formats
                  let displayTime = '';
                  if (msg.createdAt) {
                    const dateObj = msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
                    displayTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  }

                  return (
                    <div 
                      key={msg.id || index}
                      className={`flex items-start gap-2.5 group relative ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Avatar */}
                      {!isMyMessage && (
                        <div className={`w-8 h-8 rounded-full rounded-tr-md flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          msg.senderRole === 'teacher' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-violet-100 text-violet-800'
                        }`}>
                          {getDisplaySenderName(msg.senderUsername, msg.senderName).charAt(0)}
                        </div>
                      )}

                      <div className="space-y-1 max-w-[70%] relative">
                        {/* Name on group chats */}
                        {!isMyMessage && selectedRoom.type === 'group' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-500">
                              {getDisplaySenderName(msg.senderUsername, msg.senderName)}
                            </span>
                            <span className={`text-[8px] font-bold px-1 rounded-sm ${
                              msg.senderRole === 'teacher' 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : 'bg-violet-50 text-violet-600'
                            }`}>
                              {formatRole(msg.senderRole)}
                            </span>
                          </div>
                        )}

                        <div 
                          onTouchStart={() => handlePressStart(msg.id)}
                          onTouchEnd={() => handlePressEnd(msg.id)}
                          onMouseDown={() => handlePressStart(msg.id)}
                          onMouseUp={() => handlePressEnd(msg.id)}
                          onMouseLeave={() => handlePressEnd(msg.id)}
                          onClick={() => {
                            setActiveReactionPickerMessageId(prev => prev === msg.id ? null : msg.id);
                          }}
                          className={`p-3 rounded-2xl relative select-none cursor-pointer ${
                            isMyMessage 
                              ? 'bg-indigo-600 text-white rounded-tr-xs' 
                              : 'bg-white text-slate-700 rounded-tl-xs border border-slate-100 shadow-xs'
                          }`}
                        >
                          {/* Floating Reaction & Action Menu */}
                          <div className={`absolute top-full mt-1.5 ${isMyMessage ? 'right-0' : 'left-0'} ${
                            activeReactionPickerMessageId === msg.id ? 'flex' : 'hidden'
                          } flex-col gap-1.5 p-2 bg-white border border-slate-200 shadow-2xl rounded-2xl z-40 animate-in fade-in slide-in-from-top-2 duration-150 min-w-[150px]`} onClick={e => e.stopPropagation()}>
                            {/* Reaction Emojis Row */}
                            <div className="flex items-center justify-between gap-1">
                              {['👍', '❤️', '😂', '😮', '😢', '🙌'].map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleReaction(msg.id, emoji, msg.reactions);
                                  }}
                                  className="hover:scale-130 transition-transform text-xs cursor-pointer p-0.5"
                                  title={emoji}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>

                            {/* Message action options if it belongs to me */}
                            {isMyMessage && (
                              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-0.5 px-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(msg.id, msg.text);
                                  }}
                                  className="flex items-center gap-1 text-[10px] font-black text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                                >
                                  <Pencil size={10} />
                                  <span>Засах</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmMessageId(msg.id);
                                    setActiveReactionPickerMessageId(null);
                                  }}
                                  className="flex items-center gap-1 text-[10px] font-black text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={10} />
                                  <span>Устгах</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Message Content Area with Inline Edit/Delete Confirmation flow */}
                          {deleteConfirmMessageId === msg.id ? (
                            <div className="space-y-1.5 py-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] font-bold text-white/90">Зурвасыг устгахдаа итгэлтэй байна уу?</p>
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmMessageId(null)}
                                  className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg transition-colors cursor-pointer"
                                >
                                  Болих
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black rounded-lg transition-all cursor-pointer shadow-md"
                                >
                                  Устгах
                                </button>
                              </div>
                            </div>
                          ) : editingMessageId === msg.id ? (
                            <div className="space-y-2 p-0.5 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full bg-indigo-700/65 text-white placeholder:text-indigo-300 text-xs rounded-xl p-2 border border-indigo-400/40 outline-none focus:ring-2 focus:ring-white/25 resize-none font-medium h-14"
                                placeholder="Засах текстийг энд оруулна уу..."
                                autoFocus
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="px-2.5 py-1 text-[9px] bg-white/10 hover:bg-white/20 text-white rounded-lg font-black transition-colors cursor-pointer"
                                >
                                  Болих
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(msg.id)}
                                  className="px-2.5 py-1 text-[9px] bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg font-black transition-colors cursor-pointer shadow-sm"
                                >
                                  Хадгалах
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                              {msg.isEdited && (
                                <span className={`text-[8px] font-bold block mt-1 tracking-wide uppercase ${isMyMessage ? 'text-indigo-200/80' : 'text-slate-400'}`}>
                                  (зассан)
                                </span>
                              )}
                              <div className={`text-[9.5px] text-right mt-1 font-semibold select-none ${isMyMessage ? 'text-indigo-200/80' : 'text-slate-400'}`}>
                                {displayTime}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Render existing Message Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions).map(([emoji, usersArr]: [string, any]) => {
                              const hasMyReaction = usersArr.includes(user.username);
                              const reactUserNames = usersArr.map((u: string) => {
                                if (u === user.username) return 'Та';
                                const foundU = allUsers.find(item => item.username === u);
                                return foundU?.realName || u;
                              }).join(', ');

                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewReactionsData({
                                      emoji,
                                      users: usersArr
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-all cursor-pointer ${
                                    hasMyReaction 
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                      : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                                  }`}
                                  title={reactUserNames}
                                >
                                  <span>{emoji}</span>
                                  <span>{usersArr.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Seen indicator under My Messages */}
                        {isMyMessage && msg.seenBy && msg.seenBy.length > 0 && (
                          <div className="text-[9px] text-right text-slate-400 font-semibold flex items-center justify-end gap-1 mt-0.5 select-none animate-fade-in pr-1">
                            <Check size={10} className="text-indigo-500 font-bold" />
                            <span>Harsan</span>
                            {selectedRoom.type === 'group' && (
                              <span className="text-[8px] bg-slate-150 text-slate-600 px-1 py-0.5 rounded-sm" title={msg.seenBy.map((usr: string) => {
                                const foundU = allUsers.find(item => item.username === usr);
                                return foundU?.realName || usr;
                              }).join(', ')}>
                                {msg.seenBy.length}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 space-y-2 text-center select-none">
                  <Sparkles size={24} className="text-slate-300 animate-pulse" />
                  <p className="text-xs font-bold leading-relaxed text-slate-600">Энэ өрөө арай чатлаж эхлээгүй байна</p>
                  <p className="text-[10px] text-slate-400 max-w-xs">Доорх оролтын хэсэг рүү мессежээ бичин илгээнэ үү.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send Input Footer */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
              <input
                type="text"
                placeholder="Мессежээ бичнэ үү..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 placeholder:text-slate-400 text-slate-700 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all outline-none"
              />
              <button
                type="submit"
                disabled={!messageText.trim()}
                className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl shadow-md transition-all cursor-pointer flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 select-none p-8 space-y-3">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl shrink-0">
              <MessageSquare size={36} />
            </div>
            <h4 className="font-extrabold text-sm text-slate-700">Яриагаа Сонгоно уу</h4>
            <p className="text-xs text-slate-500 text-center max-w-sm leading-relaxed">
              Сургалтын систем дэх багш нар болон сурагчдын нэгдсэн чатлах хэсэг. Зүүн талын цэснээс эхлүүлэх чатаа сонгож, бодит цагийн боловсролын даалгавар, зөвлөгөөгөө солилцоно уу.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 4. MODAL: Start New Direct Message (DM) */}
      {/* ========================================================= */}
      {isDMModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col max-h-[500px]">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <UserIcon size={18} className="text-indigo-600" />
                Шинэ чат эхлүүлэх
              </h3>
              <button 
                type="button" 
                onClick={() => setIsDMModalOpen(false)} 
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                <input
                  type="text"
                  placeholder="Багш, сурагчийн нэрээр хайх..."
                  value={dmSearchQuery}
                  onChange={(e) => setDmSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredDMUsers.length > 0 ? (
                filteredDMUsers.map((u) => (
                  <button
                    type="button"
                    key={u.username}
                    onClick={() => handleStartDM(u)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-indigo-50/50 flex items-center justify-between transition-colors cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        u.role === 'teacher' ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
                      }`}>
                        {getDisplayUserProperties(u).displayName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 flex items-center gap-1">
                          <span>{getDisplayUserProperties(u).displayName}</span>
                          {u.role === 'student' && u.hasGoldBadge && (
                            <span className="text-amber-550 text-xs animate-bounce select-none flex-shrink-0" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                              🏆
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium select-none">
                          {u.grade && u.section ? `Анги: ${u.grade}${u.section}` : ''}
                        </p>
                      </div>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                      u.role === 'teacher' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-violet-50 text-violet-700 border border-violet-200'
                    }`}>
                      {formatRole(u.role)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center text-slate-400 text-xs py-8">Дуусах хүртэл хайлт олдсонгүй.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODAL: Create New Class/Group Chat */}
      {/* ========================================================= */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col max-h-[580px]">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                Групп чат үүсгэх
              </h3>
              <button 
                type="button" 
                onClick={() => setIsGroupModalOpen(false)} 
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="space-y-1.5 flex-shrink-0">
                <label className="block text-xs font-bold text-slate-600">Группын Нэр</label>
                <input
                  type="text"
                  placeholder="Жишээ: 11А Физикийн нэмэлт, Багш нарын бүлэг"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 placeholder:text-slate-400 text-slate-700 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all outline-none"
                  required
                />
              </div>

              {/* Class Auto Filter Tools */}
              <div className="bg-slate-50 p-3.5 rounded-2xl space-y-2.5 flex-shrink-0 border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs select-none">
                  <School size={14} className="text-indigo-600" />
                  <span>Ангиар нь олноор нэмэх</span>
                </div>
                
                <div className="flex items-end gap-2 text-xs">
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] font-semibold text-slate-500">Анги (Grade)</span>
                    <select
                      value={autoClassGrade}
                      onChange={(e) => setAutoClassGrade(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs"
                    >
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(g => (
                        <option key={g} value={g}>{g}-р анги</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] font-semibold text-slate-500">Бүлэг (Section)</span>
                    <select
                      value={autoClassSection}
                      onChange={(e) => setAutoClassSection(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs"
                    >
                      {['А', 'Б', 'В', 'Г', 'Д'].map(s => (
                        <option key={s} value={s}>{s} бүлэг</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoAddClassStudents}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    Нэмэх
                  </button>
                </div>
              </div>

              {/* Members Selection List */}
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-600">Сурагч ба Багш нар Сонгох</span>
                  <span className="text-slate-400 font-semibold">{selectedGroupMembers.length} хүн сонгогдсон</span>
                </div>

                <div className="relative flex-shrink-0">
                  <Search size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                  <input
                    type="text"
                    placeholder="Чат үүсгэх гишүүдийг нэрээр хайх..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-2 space-y-1 bg-slate-50/50">
                  {filteredGroupUsers.length > 0 ? (
                    filteredGroupUsers.map((u) => {
                      const isSelected = selectedGroupMembers.includes(u.username);
                      return (
                        <button
                          type="button"
                          key={u.username}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedGroupMembers(selectedGroupMembers.filter(m => m !== u.username));
                            } else {
                              setSelectedGroupMembers([...selectedGroupMembers, u.username]);
                            }
                          }}
                          className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-all cursor-pointer text-xs ${
                            isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] ${
                              u.role === 'teacher' ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
                            }`}>
                              {getDisplayUserProperties(u).displayName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 flex items-center gap-1">
                                <span>{getDisplayUserProperties(u).displayName}</span>
                                {u.role === 'student' && u.hasGoldBadge && (
                                  <span className="text-amber-550 select-none text-[13px] flex-shrink-0 animate-pulse" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                                    🏆
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-400 font-semibold select-none">
                                {u.role === 'student' && u.grade && u.section && (
                                  <span>Анги: {u.grade}{u.section}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase ${
                              u.role === 'teacher' 
                                ? 'bg-emerald-50 text-emerald-700' 
                                : 'bg-violet-50 text-violet-700'
                            }`}>
                              {formatRole(u.role)}
                            </span>
                            
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <Check size={10} />}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center text-slate-400 text-xs py-10">Хэрэглэгч олдсонгүй.</div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Болих
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Групп үүсгэх
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View who reacted details modal */}
      {viewReactionsData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <span className="text-lg">{viewReactionsData.emoji}</span>
                <span>Хариу үйлдэл үзүүлсэн хүмүүс</span>
              </h3>
              <button 
                type="button"
                onClick={() => setViewReactionsData(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {viewReactionsData.users.map((usernameStr: string) => {
                const isMe = usernameStr === user.username;
                const foundU = allUsers.find(item => item.username === usernameStr);
                const displayName = isMe ? 'Та' : (foundU?.realName || usernameStr);
                const displayRole = isMe ? (user.role === 'teacher' ? 'Багш' : 'Сурагч') : (foundU?.role === 'teacher' ? 'Багш' : 'Сурагч');

                return (
                  <div key={usernameStr} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-2xl hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        displayRole === 'Багш' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800">{displayName}</span>
                        <span className="text-[10px] text-slate-400 font-medium font-mono">@{usernameStr}</span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      displayRole === 'Багш' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {displayRole}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewReactionsData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Хаах
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
