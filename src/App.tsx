/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RoleSelection } from './components/RoleSelection';
import { LoginForm, UserData } from './components/LoginForm';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminRequestPrompt } from './components/AdminRequestPrompt';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { User, ShieldAlert } from 'lucide-react';

const isAdminUser = (user: UserData | null): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  return email === 'terdene54@gmail.com';
};

export default function App() {
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student' | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<UserData | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [setupName, setSetupName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [globalAlert, setGlobalAlert] = useState<any | null>(null);

  // Apply dark mode theme instantly on load
  useEffect(() => {
    const isDark = localStorage.getItem('school_app_dark_mode') === 'true';
    const darkThemeKey = localStorage.getItem('school_app_dark_theme') || 'charcoal';
    
    if (isDark) {
      document.documentElement.classList.add('dark-theme');
      const hexMap: Record<string, string> = {
        charcoal: '#090d16',
        ocean: '#051026',
        forest: '#021812',
        purple: '#10081d',
        earth: '#16080b',
        amoled: '#000000',
        mocha: '#110e0b',
        sapphire: '#04091a',
        emerald: '#021415',
        rose: '#130610'
      };
      const themeHex = hexMap[darkThemeKey] || '#090d16';
      document.documentElement.style.setProperty('--dark-bg', themeHex);
      document.documentElement.style.setProperty('--app-bg', themeHex);
    } else {
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.style.removeProperty('--dark-bg');
      document.documentElement.style.removeProperty('--app-bg');
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('school_app_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setLoggedInUser(parsedUser);
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
    setIsCheckingAuth(false);
  }, []);

  // Sync user data dynamically with Firestore
  useEffect(() => {
    if (!loggedInUser) return;
    const userKey = `${loggedInUser.schoolCode}_${loggedInUser.role}_${loggedInUser.username}`;
    const unsubscribeUser = onSnapshot(doc(db, 'users', userKey), (docSnap) => {
      if (docSnap.exists()) {
        const dbData = docSnap.data() as UserData;
        setLoggedInUser(prev => {
          if (!prev) return null;
          // Only trigger state update if fields actually changed, to avoid endless loops
          if (
            prev.realName !== dbData.realName ||
            prev.email !== dbData.email ||
            prev.hasGoldBadge !== dbData.hasGoldBadge
          ) {
            const merged = { ...prev, ...dbData };
            localStorage.setItem('school_app_user', JSON.stringify(merged));
            return merged;
          }
          return prev;
        });
      }
    }, (error) => {
      console.error("Error syncing user data:", error);
    });

    return () => unsubscribeUser();
  }, [loggedInUser?.schoolCode, loggedInUser?.role, loggedInUser?.username]);

  useEffect(() => {
    if (!loggedInUser) return;
    const unsubscribe = onSnapshot(doc(db, 'announcements', 'global_alert'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalAlert(docSnap.data());
      } else {
        setGlobalAlert(null);
      }
    }, (error) => {
      console.error("Error loading global alert:", error);
      handleFirestoreError(error, OperationType.GET, 'announcements/global_alert');
    });
    return () => unsubscribe();
  }, [loggedInUser]);

  const handleLogin = (userData: UserData) => {
    setLoggedInUser(userData);
    localStorage.setItem('school_app_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setSelectedRole(null);
    localStorage.removeItem('school_app_user');
  };

  const maskRealName = (nameToMask: string): string => {
    return nameToMask || '';
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInUser || !setupName.trim()) return;
    
    setIsSavingName(true);
    try {
      const userKey = `${loggedInUser.schoolCode}_${loggedInUser.role}_${loggedInUser.username}`;
      const plainName = setupName.trim();
      await updateDoc(doc(db, 'users', userKey), { realName: plainName });
      
      const updatedUser = { ...loggedInUser, realName: plainName };
      setLoggedInUser(updatedUser);
      localStorage.setItem('school_app_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error("Error saving name:", error);
      alert("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleUpdateUser = (updatedUser: UserData) => {
    setLoggedInUser(updatedUser);
    localStorage.setItem('school_app_user', JSON.stringify(updatedUser));
  };

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-[var(--app-bg,#fafafa)] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>;
  }

  if (loggedInUser) {
    if (!loggedInUser.realName) {
      return (
        <div className="min-h-screen bg-[var(--app-bg,#fafafa)] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Жинхэнэ нэрээ оруулна уу</h2>
            <p className="text-slate-600 mb-6">Таны нэвтрэх нэр зөвхөн нэвтрэхэд ашиглагдах бөгөөд бусад хүмүүст таны жинхэнэ нэр харагдах болно.</p>
            <form onSubmit={handleSaveName}>
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Жинхэнэ нэр (Овог, нэр)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-slate-800 placeholder:text-slate-400"
                    placeholder="Жишээ нь: Б.Бат-Эрдэнэ"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSavingName}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-70"
              >
                {isSavingName ? 'Хадгалж байна...' : 'Хадгалах'}
              </button>
            </form>
          </div>
        </div>
      );
    }

    const isSuperAdmin = isAdminUser(loggedInUser);

    if (isSuperAdmin && adminMode) {
      return (
        <AdminDashboard 
          user={loggedInUser} 
          onLogout={handleLogout} 
          onUpdateUser={handleUpdateUser} 
          onCloseAdmin={() => setAdminMode(false)} 
        />
      );
    }

    const renderMainDashboard = () => {
      if (loggedInUser.role === 'teacher') {
        return <TeacherDashboard user={loggedInUser} onLogout={handleLogout} onUpdateUser={handleUpdateUser} />;
      }
      return <StudentDashboard user={loggedInUser} onLogout={handleLogout} onUpdateUser={handleUpdateUser} />;
    };

    return (
      <div className="relative min-h-screen">
        {/* Float Admin Switch Header */}
        {isSuperAdmin && (
          <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 lg:px-8 border-b-2 border-amber-500 flex flex-col sm:flex-row justify-between items-center gap-3 relative z-[100] shadow-md select-none font-sans">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <p className="font-semibold text-slate-300">
                Сайн байна уу, <strong className="text-white font-black">{loggedInUser.realName}</strong>. Сургуулийн захиргааны дээд админы эрх идэвхжсэн байна.
              </p>
            </div>
            <button
              onClick={() => setAdminMode(true)}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
            >
              <ShieldAlert size={14} />
              Админ Систем рүү орох ➔
            </button>
          </div>
        )}

        {/* Global Announcement Banner */}
        {globalAlert && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-900 px-4 py-2.5 sm:px-6 lg:px-8 flex items-center gap-2.5 relative z-40 select-none text-xs font-bold leading-relaxed font-sans shadow-inner">
            <span className="flex-shrink-0 animate-bounce">📢 Сургуулийн Зар:</span>
            <marquee className="flex-1" scrollamount="4">
              {globalAlert.text} (Нийтэлсэн: {globalAlert.author} — {globalAlert.createdAt ? new Date(globalAlert.createdAt).toLocaleDateString() : ''})
            </marquee>
          </div>
        )}

        {/* Real-time admin requests listener & prompt */}
        <AdminRequestPrompt user={loggedInUser} onUpdateUser={handleUpdateUser} />

        {renderMainDashboard()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg,#fafafa)] flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Modern Grid Pattern */}
      <div className="absolute inset-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] z-0" />

      {/* Enhanced Modern Mesh Gradient Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50rem] h-[50rem] bg-fuchsia-400/30 rounded-full mix-blend-multiply filter blur-[100px] animate-blob z-0" />
      <div className="absolute top-[20%] right-[-10%] w-[45rem] h-[45rem] bg-cyan-400/30 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000 z-0" />
      <div className="absolute bottom-[-20%] left-[20%] w-[50rem] h-[50rem] bg-violet-400/30 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-4000 z-0" />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[60rem] h-[60rem] bg-amber-200/20 rounded-full mix-blend-multiply filter blur-[120px] animate-blob animation-delay-2000 z-0" />

      <div className="relative z-10 w-full">
        <AnimatePresence mode="wait">
          {!selectedRole ? (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full"
            >
              <motion.div 
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
                className="text-center w-full mb-12"
              >
                <span className="text-sm font-bold tracking-wider text-indigo-500 uppercase mb-3 block">Тавтай морилно уу</span>
                <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
                  Та аль нь вэ?
                </h1>
                <p className="text-xl text-slate-600 max-w-2xl mx-auto font-medium">
                  Өөрийн дүрээ сонгоод системд нэвтэрч орно уу.
                </p>
              </motion.div>
              <RoleSelection onSelectRole={setSelectedRole} />
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full"
            >
              <LoginForm role={selectedRole} onBack={() => setSelectedRole(null)} onLogin={handleLogin} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
