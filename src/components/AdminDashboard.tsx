import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Key, ShieldAlert, Search, RefreshCw, CheckCircle2, 
  X, Trash2, Megaphone, Calendar, ChevronRight, Lock, 
  Unlock, Settings, Activity, ArrowLeft, LogOut, Check, HelpCircle
} from 'lucide-react';
import { UserData } from './LoginForm';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, 
  deleteDoc, updateDoc, addDoc, onSnapshot, serverTimestamp 
} from 'firebase/firestore';

interface AdminDashboardProps {
  user: UserData;
  onLogout: () => void;
  onUpdateUser: (user: UserData) => void;
  onCloseAdmin: () => void;
}

export function AdminDashboard({ user, onLogout, onUpdateUser, onCloseAdmin }: AdminDashboardProps) {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [requestsList, setRequestsList] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'teacher' | 'student'>('all');

  // Edit / Request state
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRealName, setNewRealName] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Global Announcement poster state
  const [announcementText, setAnnouncementText] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<any | null>(null);

  // Success Notification
  const [successToast, setSuccessToast] = useState('');

  // Custom multi-step system reset states
  const [resetModalStep, setResetModalStep] = useState<0 | 1 | 2 | 3>(0); // 0: closed, 1: step 1, 2: step 2, 3: success reload
  const [isResetting, setIsResetting] = useState(false);

  const handleTriggerSystemReset = () => {
    setResetModalStep(1);
  };

  const executeSystemReset = async () => {
    setIsResetting(true);
    try {
      const collectionsToClear = [
        'users',
        'emails',
        'assignments',
        'lessons',
        'student_submissions',
        'attendance',
        'grades',
        'grade_visibility',
        'admin_requests',
        'announcements'
      ];

      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        const deletePromises = snap.docs.map(docSnap => deleteDoc(doc(db, colName, docSnap.id)));
        await Promise.all(deletePromises);
      }

      setIsResetting(false);
      setResetModalStep(0);
      onLogout();
      window.location.reload();
    } catch (err) {
      console.error("Purge failure:", err);
      alert("Устгахад алдаа гарлаа: " + (err as Error).message);
      setIsResetting(false);
      setResetModalStep(0);
    }
  };

  // 1. Fetch Users in the same school
  useEffect(() => {
    setIsLoadingUsers(true);
    const q = query(
      collection(db, 'users')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(docSnap => ({
        userKey: docSnap.id,
        ...docSnap.data()
      }));
      setUsersList(users);
      setIsLoadingUsers(false);
    }, (error) => {
      console.error("Error loading users for admin:", error);
      setIsLoadingUsers(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch Admin Change Requests
  useEffect(() => {
    setIsLoadingRequests(true);
    const q = query(
      collection(db, 'admin_requests')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as any));
      // Sort: newest first
      requests.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setRequestsList(requests);
      setIsLoadingRequests(false);
    }, (error) => {
      console.error("Error loading requests for admin:", error);
      setIsLoadingRequests(false);
    });

    return () => unsubscribe();
  }, []);

  // 3. Fetch active announcement
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'announcements', 'global_alert'), (docSnap) => {
      if (docSnap.exists()) {
        setActiveAnnouncement(docSnap.data());
      } else {
        setActiveAnnouncement(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleOpenEditModal = (targetUser: any) => {
    setEditingUser(targetUser);
    setNewUsername(targetUser.username);
    setNewPassword(targetUser.password);
    setNewRealName(targetUser.realName || '');
  };

  const handleCloseEditModal = () => {
    setEditingUser(null);
    setNewUsername('');
    setNewPassword('');
    setNewRealName('');
  };

  // Submit password/username change request (pending user approval) + direct realName change
  const handleSubmitRequestAndAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !newUsername.trim() || !newPassword.trim() || !newRealName.trim()) return;

    setIsSubmittingRequest(true);
    try {
      // 1. Direct update of realName in the user's document
      if (newRealName.trim() !== (editingUser.realName || '')) {
        const userDocRef = doc(db, 'users', editingUser.userKey);
        await updateDoc(userDocRef, { realName: newRealName.trim() });
      }

      // 2. Check if username or password actually changed
      if (newUsername.trim() !== editingUser.username || newPassword.trim() !== editingUser.password) {
        const requestsRef = collection(db, 'admin_requests');
        const reqData = {
          userKey: editingUser.userKey,
          schoolCode: user.schoolCode,
          role: editingUser.role,
          currentUsername: editingUser.username,
          currentPassword: editingUser.password,
          requestedUsername: newUsername.trim(),
          requestedPassword: newPassword.trim(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          targetRealName: newRealName.trim()
        };

        await addDoc(requestsRef, reqData);
        setSuccessToast(`"${newRealName.trim()}" хэрэглэгчийн нэвтрэх мэдээллийг шинэчлэх хүсэлт илгээгдлээ. Жинхэнэ нэрийг шууд шинэчиллээ.`);
      } else {
        setSuccessToast(`"${newRealName.trim()}" хэрэглэгчийн жинхэнэ нэр ("Жинхэнэ нэр") амжилттай шинэчлэгдлээ.`);
      }

      // Auto close toast
      setTimeout(() => setSuccessToast(''), 6000);
      handleCloseEditModal();
    } catch (err) {
      console.error("Failed to update user or post change request:", err);
      alert("Мэдээллийг шинэчлэхэд алдаа гарлаа.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim()) return;

    setIsPostingAnnouncement(true);
    try {
      await setDoc(doc(db, 'announcements', 'global_alert'), {
        text: announcementText.trim(),
        author: user.realName || user.username,
        createdAt: new Date().toISOString()
      });
      setAnnouncementText('');
      setSuccessToast('Сургуулийн нийтийн зарын самбарт амжилттай нийтэллээ!');
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err) {
      console.error("Error posting announcement:", err);
      alert("Нийтлэхэд алдаа гарлаа.");
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleClearAnnouncement = async () => {
    try {
      await deleteDoc(doc(db, 'announcements', 'global_alert'));
      setSuccessToast('Зарыг устгалаа.');
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err) {
      console.error("Error deleting announcement:", err);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm("Хүсэлтийг цуцлах болон устгахдаа итгэлтэй байна уу?")) return;
    try {
      await deleteDoc(doc(db, 'admin_requests', requestId));
      setSuccessToast('Хүсэлтийг устгалаа.');
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err) {
      console.error("Error canceling request:", err);
    }
  };

  // Filtered Users
  const filteredUsers = usersList.filter(u => {
    const matchSearch = 
      (u.realName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (roleFilter === 'all') return matchSearch;
    return u.role === roleFilter && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50/50 relative overflow-hidden font-sans">
      {/* Toast Alert */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 left-6 md:left-auto md:max-w-md z-50 bg-[#0f172a] text-white p-5 rounded-2xl shadow-2xl border border-slate-800 flex items-start gap-3"
          >
            <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h5 className="font-bold text-sm">Амжилттай</h5>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{successToast}</p>
            </div>
            <button onClick={() => setSuccessToast('')} className="text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative vector background shapes */}
      <div className="absolute top-[-20%] left-[-10%] w-[50rem] h-[50rem] bg-indigo-500/10 rounded-full mix-blend-multiply filter blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45rem] h-[45rem] bg-indigo-500/10 rounded-full mix-blend-multiply filter blur-[150px] pointer-events-none" />

      {/* Admin Panel Header */}
      <header className="bg-slate-900 text-white shadow-xl relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500 text-slate-900 rounded-2xl flex items-center justify-center font-black animate-pulse">
              <ShieldAlert size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  СУРГУУЛИЙН СУПЕР АДМИН
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tight">{user.realName || 'Удирдагч'}</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={onCloseAdmin}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-sm font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer border border-slate-700 hover:border-slate-600"
            >
              <ArrowLeft size={16} />
              Кабинет руу буцах
            </button>
            <button 
              onClick={onLogout}
              className="px-4 py-2.5 bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer border border-red-500/20"
            >
              <LogOut size={16} />
              Гарах
            </button>
          </div>
        </div>
      </header>

      {/* Main content - grid layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Quick announcement and stats */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Bento Stats Block */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="text-indigo-500" size={18} />
              Ажиглалтын самбар
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Бүх багш</span>
                <span className="text-3xl font-black text-slate-800 mt-2">
                  {usersList.filter(u => u.role === 'teacher').length}
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Нийт сурагч</span>
                <span className="text-3xl font-black text-slate-800 mt-2">
                  {usersList.filter(u => u.role === 'student').length}
                </span>
              </div>

              <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-100 flex flex-col justify-between col-span-2">
                <span className="text-xs font-bold text-amber-700 uppercase flex items-center justify-between">
                  <span>Зөвшөөрөл хүлээж буй</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                </span>
                <span className="text-2xl font-black text-amber-900 mt-1">
                  {requestsList.filter(r => r.status === 'pending').length} хүсэлт
                </span>
                <p className="text-[10px] text-amber-600 font-medium mt-1">Хэрэглэгчдийн хаяг руу асуулга илгээсэн байна.</p>
              </div>
            </div>
          </div>

          {/* Announcements block */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Megaphone className="text-red-500" size={18} />
                Сургуулийн зарын самбар
              </h4>
              {activeAnnouncement && (
                <button 
                  onClick={handleClearAnnouncement}
                  className="text-xs text-red-500 hover:underline font-bold"
                >
                  Зарыг буулгах
                </button>
              )}
            </div>

            {activeAnnouncement ? (
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 relative overflow-hidden group">
                <span className="absolute right-2 top-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Идэвхтэй зар</span>
                <p className="text-xs font-semibold text-red-800 leading-relaxed max-w-[90%]">
                  "{activeAnnouncement.text}"
                </p>
                <div className="flex justify-between items-center text-[10px] text-red-600/80 font-bold mt-4 pt-2 border-t border-red-100">
                  <span>Нийтэлсэн: {activeAnnouncement.author}</span>
                  <span>{activeAnnouncement.createdAt ? new Date(activeAnnouncement.createdAt).toLocaleDateString() : ''}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Сургуулийн нийт бүртгэлтэй хэрэглэгчдэд нээлттэй харагдах зар байхгүй байна.</p>
            )}

            <form onSubmit={handlePostAnnouncement} className="space-y-3">
              <textarea 
                rows={3}
                placeholder="Зарын самбарт орох текст. (Жишээ: Дүнгийн системд нэвтрэх заавар шинэчлэгдлээ...)"
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-medium"
                required
              />
              <button
                type="submit"
                disabled={isPostingAnnouncement || !announcementText.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                {isPostingAnnouncement ? 'Нийтэлж байна...' : 'Шинэ зар нийтлэх'}
              </button>
            </form>
          </div>

          {/* System Reset block */}
          <div className="bg-red-50/50 rounded-3xl p-6 shadow-sm border border-red-200/50 space-y-4">
            <h4 className="text-base font-bold text-red-800 flex items-center gap-2">
              <Trash2 className="text-red-600" size={18} />
              Аюулгүйн цэвэрлэгээ
            </h4>
            <p className="text-xs text-red-700/80 leading-relaxed font-semibold">
              Сургуулийн системийн өгөгдлийн санг иж бүрнээр цэвэрлэх хэсэг. Энд дарснаар бүх багш, сурагчдын бүртгэл, дүн, ирц, даалгаврыг бүрмөсөн цэвэрлэнэ.
            </p>
            <button
              onClick={handleTriggerSystemReset}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={14} />
              Системийг бүрэн цэвэрлэх (Өгөгдлийн сан устгах)
            </button>
          </div>

        </div>

        {/* Right column: Main Users list & requests tracker */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* User list card */}
          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Users className="text-slate-600" size={20} />
                    Сургуулийн хэрэглэгчид ({filteredUsers.length})
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Багш, сурагчийн хажуугийн түлхүүр дүрс дээр дарж нэвтрэх нэр эсвэл нууц үг өөрчлөх хүсэлт илгээнэ үү.
                  </p>
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search size={16} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Нэр, нэвтрэх нэр, имэйлээр хайх..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 transition-colors font-medium text-slate-800"
                  />
                </div>

                <div className="flex gap-1.5 bg-slate-50 border border-slate-200/60 p-1 rounded-xl">
                  {[
                    { id: 'all', label: 'Бүгд' },
                    { id: 'teacher', label: 'Багш' },
                    { id: 'student', label: 'Сурагч' }
                  ].map((roleOpt) => (
                    <button
                      key={roleOpt.id}
                      onClick={() => setRoleFilter(roleOpt.id as any)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        roleFilter === roleOpt.id
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {roleOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Users grid */}
            {isLoadingUsers ? (
              <div className="py-24 text-center">
                <RefreshCw className="animate-spin text-indigo-600 mx-auto mb-3" size={24} />
                <p className="text-slate-400 text-xs font-semibold">Хэрэглэгчийн мэдээллийг ачаалж байна...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-24 text-center">
                <HelpCircle className="text-slate-300 mx-auto mb-4" size={36} />
                <p className="text-slate-500 font-bold text-sm">Хайлттай тохирох хэрэглэгч олдсонгүй</p>
                <p className="text-slate-400 text-xs mt-1">Хайлтын утгаа шалгана уу.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-6">Хэрэглэгч</th>
                      <th className="py-3 px-4">Нэвтрэх нэр</th>
                      <th className="py-3 px-4">Нууц үг</th>
                      <th className="py-3 px-4 text-center">Үүрэг / Хаяг</th>
                      <th className="py-3 px-6 text-center">Ажиллагаа</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u) => (
                      <tr key={u.userKey} className="hover:bg-slate-50/50 group transition-colors">
                        <td className="py-3 px-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-sm">{u.realName || 'Оруулаагүй'}</span>
                            <span className="text-slate-400 font-mono text-[10px] mt-0.5">{u.email || '@холбоогүй'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700 font-mono">@{u.username}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono font-medium">{u.password}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              u.role === 'teacher' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {u.role === 'teacher' ? 'Багш' : 'Сурагч'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold mt-1">
                              {u.role === 'teacher' ? (u.subject || 'Хичээлгүй') : `${u.grade}${u.section} бүлэг`}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-6 text-center">
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="bg-slate-50 hover:bg-slate-900 text-slate-600 hover:text-white p-2 rounded-xl transition-all cursor-pointer border border-slate-200/80 hover:border-slate-800 hover:-translate-y-0.5 shadow-sm inline-flex items-center gap-1.5 font-bold"
                            title="Хэрэглэгчийн мэдээллийг өөрчлөх хүсэлт илгээх"
                          >
                            <Key size={13} />
                            Засах
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Requests tracker cards */}
          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-purple-500" size={18} />
                Зөвшөөрлийн хүсэлтүүдийн түүх
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Админаас хэрэглэгч рүү илгээсэн бүх нэвтрэх нэр, нууц үгийн орон нутгийн шинэчлэлтийн асуулга болон шийдвэрүүд:
              </p>
            </div>

            {isLoadingRequests ? (
              <div className="p-12 text-center">
                <RefreshCw className="animate-spin text-purple-600 mx-auto" size={20} />
              </div>
            ) : requestsList.length === 0 ? (
              <div className="p-12 text-center text-slate-400 italic text-xs">
                Одоогоор ямар нэгэн солих хүсэлт илгээгдээгүй байна.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {requestsList.map((req) => (
                  <div key={req.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 text-xs">{req.targetRealName}</span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                          req.role === 'teacher' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {req.role === 'teacher' ? 'Багш' : 'Сурагч'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>Үелэл: <strong className="text-slate-700">@{req.currentUsername}</strong> ➔ <strong className="text-indigo-600">@{req.requestedUsername}</strong></span>
                        <span>|</span>
                        <span>Нууц үг: <strong className="text-slate-700">{req.currentPassword}</strong> ➔ <strong className="text-indigo-600">{req.requestedPassword}</strong></span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                        <Calendar size={10} />
                        Үүссэн: {req.createdAt ? new Date(req.createdAt).toLocaleString() : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Status label */}
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${
                        req.status === 'approved' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : req.status === 'rejected'
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
                      }`}>
                        {req.status === 'approved' && 'Зөвшөөрсөн ✓'}
                        {req.status === 'rejected' && 'Татгалзсан ✗'}
                        {req.status === 'pending' && 'Зөвшөөрөл хүлээж буй...'}
                      </span>

                      {/* Cancel / delete action button */}
                      {req.status === 'pending' && (
                        <button
                          onClick={() => handleCancelRequest(req.id)}
                          className="p-1 px-2.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-[10px] font-bold transition-all"
                        >
                          Цуцлах
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="text-center py-10 text-slate-400 text-xs border-t border-slate-200 bg-slate-50/50 mt-12">
        <p>© Ухаалаг Сургуулийн Удирдлагын аюулгүй байдлын систем • Бүх эрх хамгаалагдсан</p>
      </footer>

      {/* --- CREDENTIALS EDIT CHANGE-REQUEST ASK DIALOG MODAL --- */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 relative overflow-hidden animate-in">
            <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Key className="text-indigo-600" size={22} />
              Мэдээлэл солих хүсэлт үүсгэх
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Мөрдөгдөж буй нууцлалын дагуу таны оруулсан өөрчлөлтийг хэрэглэгч рүү (<strong className="text-slate-700">{editingUser.realName || editingUser.username}</strong>) зөвшөөрөл хүссэн асуулга хэлбэрээр илгээнэ. Хэрэглэгч өөрийн кабинетаас уг өөрчлөлтийг зөвшөөрснөөр хадгалагдано.
            </p>

            <form onSubmit={handleSubmitRequestAndAsk} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Одоогийн мэдээлэл</label>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-slate-600 text-xs font-medium font-sans">
                  <div>Одоогийн нэр: <strong className="text-slate-800">{editingUser.realName || editingUser.username}</strong></div>
                  <div>Одоогийн нууц үг: <strong className="text-slate-800">{editingUser.password}</strong></div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Овог нэр</label>
                <input
                  type="text"
                  value={newRealName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewRealName(val);
                    setNewUsername(val);
                  }}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm font-bold text-slate-800 placeholder:font-sans"
                  placeholder="Жишээ нь: Б.Бат-Эрдэнэ"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Шинэ нууц үг</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm font-bold font-mono text-slate-800"
                  placeholder="Шинэ нууц үг"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="flex-1 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold rounded-2xl text-sm transition-colors cursor-pointer"
                >
                  Болих
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-75 text-white font-bold rounded-2xl text-sm transition-colors cursor-pointer shadow-lg shadow-slate-900/10"
                >
                  {isSubmittingRequest ? 'Хүсэлт илгээж байна...' : 'Хүсэлт илгээх'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SYSTEM RESET MULTI-STEP MODAL */}
      {resetModalStep > 0 && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-red-100 max-w-sm w-full p-6 sm:p-8 relative overflow-hidden animate-in fade-in duration-200">
            
            {/* Step 1: Initial Question */}
            {resetModalStep === 1 && (
              <div className="space-y-6">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 mx-auto">
                  <ShieldAlert size={26} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-base font-extrabold text-slate-800">
                    Та систем цэвэрлэхдээ итгэлтэй байна уу?
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Бүх сурагчдын ирц, дүн, даалгавар, хичээлийн тэмдэглэл болон багш, сурагчдын бүх нэвтрэх хаягуудыг өгөгдлийн сангаас бүрмөсөн цэвэрлэх гэж байна.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalStep(0)}
                    className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    Үгүй
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModalStep(2)}
                    className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center shadow-md shadow-red-200"
                  >
                    Тийм
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Final Confirmation */}
            {resetModalStep === 2 && (
              <div className="space-y-6">
                <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white mx-auto animate-bounce">
                  <Trash2 size={24} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-base font-extrabold text-red-700">
                    Дахиад итгэлтэй байна уу?
                  </h3>
                  <p className="text-xs text-red-500 font-bold leading-relaxed">
                    Энэ үйлдлийг буцах боломжгүй бөгөөд бүх хаяг болон сурагчдын мэдээллүүд өгөгдлийн сангаас бүрмөсөн устахыг анхаарна уу!
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isResetting}
                    onClick={() => setResetModalStep(0)}
                    className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    Үгүй (Болих)
                  </button>
                  <button
                    type="button"
                    disabled={isResetting}
                    onClick={executeSystemReset}
                    className="py-3 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center shadow-lg shadow-red-700/20 flex items-center justify-center gap-2"
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw className="animate-spin" size={14} />
                        Устгаж байна...
                      </>
                    ) : (
                      'Тийм (Баталгаажуулах)'
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
