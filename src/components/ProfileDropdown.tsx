import React, { useState, useRef, useEffect } from 'react';
import { UserData } from './LoginForm';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Settings, Moon, Sun, User, Lock, Edit3, Check, X, Mail, LogOut, BookOpen, FileText, CheckCircle2, Sparkles, Award } from 'lucide-react';

interface ProfileDropdownProps {
  user: UserData;
  onUpdateUser: (user: UserData) => void;
  onLogout: () => void;
}

interface DarkThemeOption {
  key: string;
  name: string;
  targetHex: string;
}

const DARK_THEMES: DarkThemeOption[] = [
  { key: 'charcoal', name: 'Одот сансар', targetHex: '#090d16' },
  { key: 'ocean', name: 'Далайн гүн', targetHex: '#051026' },
  { key: 'forest', name: 'Ногоон аялгуу', targetHex: '#021812' },
  { key: 'purple', name: 'Хааны нил', targetHex: '#10081d' },
  { key: 'earth', name: 'Ангараг улаан', targetHex: '#16080b' },
  { key: 'amoled', name: 'Харанхуй Onyx', targetHex: '#000000' },
  { key: 'mocha', name: 'Кофе Мокко', targetHex: '#110e0b' },
  { key: 'sapphire', name: 'Гүн Индранил', targetHex: '#04091a' },
  { key: 'emerald', name: 'Маргад Эрдэнэ', targetHex: '#021415' },
  { key: 'rose', name: 'Гүн Сарнай', targetHex: '#130610' }
];

function getInvertedColorForFilter(targetHex: string): string {
  if (targetHex === '#000000') return '#ffffff';
  if (targetHex === '#ffffff') return '#000000';
  
  // 1. Parse hex to RGB in range [0, 1]
  const r = parseInt(targetHex.substring(1, 3), 16) / 255;
  const g = parseInt(targetHex.substring(3, 5), 16) / 255;
  const b = parseInt(targetHex.substring(5, 7), 16) / 255;

  // 2. Invert the color (invert(1))
  const r1 = 1 - r;
  const g1 = 1 - g;
  const b1 = 1 - b;

  // 3. Apply hue-rotate(180deg) using exact W3C sRGB hue-rotate matrix for theta = 180deg
  const a00 = -0.574;
  const a01 = 1.430;
  const a02 = 0.144;

  const a10 = 0.426;
  const a11 = 0.430;
  const a12 = 0.144;

  const a20 = 0.426;
  const a21 = 1.430;
  const a22 = -0.856;

  let r_out = a00 * r1 + a01 * g1 + a02 * b1;
  let g_out = a10 * r1 + a11 * g1 + a12 * b1;
  let b_out = a20 * r1 + a21 * g1 + a22 * b1;

  // 4. Clamp results to [0, 1]
  r_out = Math.min(1, Math.max(0, r_out));
  g_out = Math.min(1, Math.max(0, g_out));
  b_out = Math.min(1, Math.max(0, b_out));

  // 5. Convert back to hex digits
  const toHex = (val: number) => {
    const intVal = Math.round(val * 255);
    const hex = Math.max(0, Math.min(255, intVal)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r_out)}${toHex(g_out)}${toHex(b_out)}`;
}

export function ProfileDropdown({ user, onUpdateUser, onLogout }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('school_app_dark_mode') === 'true';
  });
  const [darkThemeKey, setDarkThemeKey] = useState(() => {
    return localStorage.getItem('school_app_dark_theme') || 'charcoal';
  });
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState<'none' | 'name' | 'password' | 'email'>('none');
  const [newUsername, setNewUsername] = useState(user.username);
  const [newRealName, setNewRealName] = useState(user.realName || '');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState(user.email || '');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [stats, setStats] = useState<{
    lessons?: number;
    assignments?: number;
    quizzes?: number;
    submissions?: number;
    quizSubmissions?: number;
    grades?: number;
  }>({});
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      setIsStatsLoading(true);
      try {
        if (user.role === 'teacher') {
          // fetch lessons
          const lessonsQuery = query(collection(db, 'lessons'), where('teacher', '==', user.username));
          const lessonsSnap = await getDocs(lessonsQuery);
          
          // fetch assignments
          const assignmentsQuery = query(collection(db, 'assignments'), where('teacher', '==', user.username));
          const assignmentsSnap = await getDocs(assignmentsQuery);

          // fetch quizzes
          const quizzesQuery = query(collection(db, 'quizzes'));
          const quizzesSnap = await getDocs(quizzesQuery);
          let qCount = 0;
          quizzesSnap.forEach(doc => {
            const data = doc.data();
            if (data.teacher === user.username || data.createdBy === user.username) {
              qCount++;
            }
          });

          setStats({
            lessons: lessonsSnap.size,
            assignments: assignmentsSnap.size,
            quizzes: qCount
          });
        } else if (user.role === 'student') {
          // fetch submitted assignments
          const subQuery = query(collection(db, 'student_submissions'), where('studentUsername', '==', user.username));
          const subSnap = await getDocs(subQuery);

          // fetch quiz submissions
          const quizSnap = query(collection(db, 'quiz_submissions'), where('studentUsername', '==', user.username));
          const quizSnapDocs = await getDocs(quizSnap);

          // fetch grades
          const gradesQuery = query(collection(db, 'grades'), where('studentUsername', '==', user.username));
          const gradesSnap = await getDocs(gradesQuery);

          setStats({
            submissions: subSnap.size,
            quizSubmissions: quizSnapDocs.size,
            grades: gradesSnap.size
          });
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchStats();
  }, [isOpen, user.username, user.role]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Өглөөний мэнд ☀️';
    if (hour >= 12 && hour < 18) return 'Өдрийн цагийн мэнд ☀️';
    if (hour >= 18 && hour < 22) return 'Оройн мэнд 🌙';
    return 'Шөнийн мэнд 💤';
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      // If the clicked target is no longer connected to the active DOM body,
      // it means it was likely unmounted during a react state update inside this click frame.
      // Discard this event, we shouldn't trigger "click outside" closure.
      if (!target || !document.body.contains(target)) {
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
        setEditMode('none');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('school_app_dark_mode', isDark ? 'true' : 'false');
    localStorage.setItem('school_app_dark_theme', darkThemeKey);

    if (isDark) {
      document.documentElement.classList.add('dark-theme');
      const selectedTheme = DARK_THEMES.find(t => t.key === darkThemeKey) || DARK_THEMES[0];
      
      document.documentElement.style.setProperty('--dark-bg', selectedTheme.targetHex);
      document.documentElement.style.setProperty('--app-bg', selectedTheme.targetHex);
    } else {
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.style.removeProperty('--dark-bg');
      document.documentElement.style.removeProperty('--app-bg');
    }
  }, [isDark, darkThemeKey]);

  const handleSaveProfile = async () => {
    if (!newUsername.trim() || !newRealName.trim()) {
      setMessage('Нэрээ бүрэн оруулна уу.');
      return;
    }
    setIsLoading(true);
    setMessage('');
    const maskRealName = (nameToMask: string): string => {
      return nameToMask || '';
    };

    const maskedRealName = maskRealName(newRealName);

    try {
      const oldKey = `${user.schoolCode}_${user.role}_${user.username}`;
      const newKey = `${user.schoolCode}_${user.role}_${newUsername.trim()}`;

      const oldDocRef = doc(db, 'users', oldKey);
      const oldDocSnap = await getDoc(oldDocRef);

      if (!oldDocSnap.exists()) {
        setMessage('Хэрэглэгч олдсонгүй.');
        setIsLoading(false);
        return;
      }

      const userData = oldDocSnap.data();

      // If username changed, we need to migrate the document
      if (oldKey !== newKey) {
        const newDocRef = doc(db, 'users', newKey);
        const newDocSnap = await getDoc(newDocRef);
        if (newDocSnap.exists()) {
          setMessage('Энэ нэвтрэх нэр бүртгэлтэй байна.');
          setIsLoading(false);
          return;
        }
        await setDoc(newDocRef, {
          ...userData,
          username: newUsername.trim(),
          realName: newRealName.trim()
        });
        await deleteDoc(oldDocRef);

        // Update foreign keys
        if (user.role === 'teacher') {
          const collectionsToUpdate = ['lessons', 'assignments', 'attendance', 'student_submissions'];
          for (const col of collectionsToUpdate) {
            const q = query(collection(db, col), where('teacher', '==', user.username));
            const snapshot = await getDocs(q);
            const updatePromises = snapshot.docs.map(d => updateDoc(doc(db, col, d.id), { teacher: newUsername.trim() }));
            await Promise.all(updatePromises);
          }
        } else if (user.role === 'student') {
          const q = query(collection(db, 'student_submissions'), where('studentUsername', '==', user.username));
          const snapshot = await getDocs(q);
          const updatePromises = snapshot.docs.map(d => updateDoc(doc(db, 'student_submissions', d.id), { 
            studentUsername: newUsername.trim(),
            studentName: newRealName.trim()
          }));
          await Promise.all(updatePromises);
        }
      } else {
        // Just update realName
        await setDoc(oldDocRef, {
          ...userData,
          realName: newRealName.trim()
        }, { merge: true });
      }

      const updatedUser = { ...user, username: newUsername.trim(), realName: newRealName.trim() };
      onUpdateUser(updatedUser);
      setEditMode('none');
      setMessage('Амжилттай шинэчлэгдлээ.');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Алдаа гарлаа.');
    }
    setIsLoading(false);
  };

  const handleSavePassword = async () => {
    if (!newPassword.trim()) {
      setMessage('Нууц үгээ оруулна уу.');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const userKey = `${user.schoolCode}_${user.role}_${user.username}`;
      const docRef = doc(db, 'users', userKey);
      await setDoc(docRef, { password: newPassword }, { merge: true });
      setEditMode('none');
      setNewPassword('');
      setMessage('Нууц үг амжилттай солигдлоо.');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Алдаа гарлаа.');
    }
    setIsLoading(false);
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setMessage('Зөв имэйл хаяг оруулна уу.');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const userKey = `${user.schoolCode}_${user.role}_${user.username}`;
      const docRef = doc(db, 'users', userKey);
      await setDoc(docRef, { email: newEmail.trim().toLowerCase() }, { merge: true });

      const updatedUser = { ...user, email: newEmail.trim().toLowerCase() };
      onUpdateUser(updatedUser);
      setEditMode('none');
      setMessage('Имэйл хаяг амжилттай шинэчлэгдлээ.');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Алдаа гарлаа.');
    }
    setIsLoading(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="flex items-center gap-2.5 hover:bg-slate-100 p-2 rounded-2xl transition-all outline-none cursor-pointer active:scale-[0.98] select-none touch-manipulation min-h-[44px]"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 ${user.role === 'teacher' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}`}>
          {(user.realName || user.username).charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col text-left max-w-[110px] sm:max-w-none">
          <span className="font-bold text-slate-800 leading-tight text-xs sm:text-sm md:text-base truncate flex items-center gap-1">
            <span className="truncate">{user.realName || user.username}</span>
            {user.role === 'student' && user.hasGoldBadge && (
              <span className="inline-flex items-center text-amber-550 select-none animate-pulse shrink-0" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                <Award size={14} className="fill-amber-400 stroke-amber-600 font-bold" />
              </span>
            )}
          </span>
          <span className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">{user.role === 'teacher' ? 'Багш' : `${user.grade}${user.section}`}</span>
        </div>
      </button>

      {isOpen && (
        <>
          {/* Backdrop Overlay with slight blur */}
          <div 
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-[100] transition-opacity duration-300 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              setEditMode('none');
            }}
          />
          
          {/* Right Slide-over Drawer Panel */}
          <div 
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="profile-drawer-panel fixed top-0 right-0 h-screen w-full sm:w-[390px] max-w-full bg-white shadow-[0_0_50px_rgba(0,0,0,0.15)] z-[110] flex flex-col border-l border-slate-100 animate-in slide-in-from-right duration-250 ease-out"
          >
            {/* Drawer Header */}
            <div className="profile-drawer-header p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-xs ${user.role === 'teacher' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}`}>
                  {(user.realName || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs text-indigo-600 font-bold flex items-center gap-1">
                    <Sparkles size={12} className="animate-spin duration-1000" />
                    {getGreeting()}
                  </span>
                  <p className="font-bold text-slate-800 text-base leading-tight truncate max-w-[200px] mt-0.5 flex items-center gap-1">
                    <span className="truncate">{user.realName || user.username}</span>
                    {user.role === 'student' && user.hasGoldBadge && (
                      <span className="inline-flex items-center text-amber-550 select-none animate-pulse shrink-0" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                        <Award size={16} className="fill-amber-400 stroke-amber-600 font-bold" />
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">@{user.username} • {user.role === 'teacher' ? 'Багш' : `${user.grade}${user.section}`}</p>
                </div>
              </div>
              
              <button 
                onClick={() => {
                  setIsOpen(false);
                  setEditMode('none');
                }}
                className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl transition-all cursor-pointer"
                title="Хаах"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {message && (
                <div className="p-3 text-sm text-center rounded-xl bg-blue-50 text-blue-600 font-semibold animate-pulse">
                  {message}
                </div>
              )}

              {/* Dynamic Statistics Cards - Horizontal rows with values on the right */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-wider">Таны үзүүлэлтүүд</p>
                <div className="space-y-2">
                  {user.role === 'teacher' ? (
                    <>
                      <div className="p-3 bg-blue-50/45 border border-blue-100/20 rounded-2xl flex items-center justify-between hover:bg-blue-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                            <BookOpen size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Оруулсан хичээл</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-blue-600 bg-white px-3 py-1 rounded-xl border border-blue-100">
                          {isStatsLoading ? '...' : (stats.lessons ?? 0)}
                        </span>
                      </div>
                      
                      <div className="p-3 bg-indigo-50/45 border border-indigo-100/20 rounded-2xl flex items-center justify-between hover:bg-indigo-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                            <FileText size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Даалгавар байршуулсан</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-indigo-650 bg-white px-3 py-1 rounded-xl border border-indigo-100">
                          {isStatsLoading ? '...' : (stats.assignments ?? 0)}
                        </span>
                      </div>

                      <div className="p-3 bg-purple-50/45 border border-purple-100/20 rounded-2xl flex items-center justify-between hover:bg-purple-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                            <Award size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Шалгалт боловсруулсан</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-purple-600 bg-white px-3 py-1 rounded-xl border border-purple-100">
                          {isStatsLoading ? '...' : (stats.quizzes ?? 0)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-blue-50/45 border border-blue-100/20 rounded-2xl flex items-center justify-between hover:bg-blue-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                            <FileText size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Илгээсэн даалгавар</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-blue-600 bg-white px-3 py-1 rounded-xl border border-blue-100">
                          {isStatsLoading ? '...' : (stats.submissions ?? 0)}
                        </span>
                      </div>

                      <div className="p-3 bg-teal-50/45 border border-teal-100/20 rounded-2xl flex items-center justify-between hover:bg-teal-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-teal-100 text-teal-600 rounded-xl">
                            <CheckCircle2 size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Бөгөлсөн шалгалт</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-teal-600 bg-white px-3 py-1 rounded-xl border border-teal-100">
                          {isStatsLoading ? '...' : (stats.quizSubmissions ?? 0)}
                        </span>
                      </div>

                      <div className="p-3 bg-amber-50/45 border border-amber-100/20 rounded-2xl flex items-center justify-between hover:bg-amber-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                            <Award size={16} />
                          </div>
                          <span className="text-sm text-slate-700 font-bold">Авсан дүн</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-amber-600 bg-white px-3 py-1 rounded-xl border border-amber-100">
                          {isStatsLoading ? '...' : (stats.grades ?? 0)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Status card with Linked Email info */}
              {user.email && (
                <div className="p-4 bg-indigo-50/40 border border-indigo-100/30 rounded-2xl flex items-start gap-3">
                  <Mail className="text-indigo-505 mt-0.5 flex-shrink-0" size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Холбогдсон хаяг</p>
                    <p className="text-sm text-indigo-600 font-bold font-mono mt-0.5 truncate">{user.email}</p>
                  </div>
                </div>
              )}

              {/* Dark mode toggle section */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-slate-700 font-bold text-sm">
                    {isDark ? <Moon size={18} className="text-indigo-500" /> : <Sun size={18} className="text-amber-500" />}
                    <span>Харанхуй горим</span>
                  </div>
                  <button 
                    onClick={() => setIsDark(!isDark)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${isDark ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${isDark ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {isDark && (
                  <div className="pt-2.5 border-t border-slate-100/50 space-y-2.5">
                    <p className="text-xs font-bold text-slate-500">Арын фон өнгө:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {DARK_THEMES.map((theme) => {
                        const isSelected = darkThemeKey === theme.key;
                        return (
                          <button
                            key={theme.key}
                            type="button"
                            onClick={() => setDarkThemeKey(theme.key)}
                            className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left cursor-pointer active:scale-95 select-none no-invert ${
                              isSelected
                                ? 'bg-indigo-600/10 border-indigo-500 shadow-md shadow-indigo-500/5 font-black'
                                : 'bg-white border-slate-100 hover:bg-slate-50'
                            }`}
                          >
                            <div 
                              className="w-5 h-5 rounded-full flex-shrink-0 border border-black/10 flex items-center justify-center font-bold text-[9px] text-white shadow-xs"
                              style={{ backgroundColor: theme.targetHex }}
                            >
                              {isSelected && "✓"}
                            </div>
                            <span className="text-[11px] font-bold truncate">
                              {theme.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Edit options / Main actions list */}
              {editMode === 'none' && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-wider">Профайл засварлах</p>
                  
                  <button 
                    onClick={() => { setEditMode('name'); setNewUsername(user.username); setNewRealName(user.realName || ''); }}
                    className="w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all text-slate-700 font-bold text-xs sm:text-sm cursor-pointer active:scale-[0.99] bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <User size={16} className="text-slate-500" />
                      <span>Нэр солих</span>
                    </div>
                    <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Засах</span>
                  </button>

                  <button 
                    onClick={() => setEditMode('password')}
                    className="w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all text-slate-700 font-bold text-xs sm:text-sm cursor-pointer active:scale-[0.99] bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <Lock size={16} className="text-slate-500" />
                      <span>Нууц үг солих</span>
                    </div>
                    <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Нууц үг</span>
                  </button>

                  <button 
                    onClick={() => { setEditMode('email'); setNewEmail(user.email || ''); }}
                    className="w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all text-slate-700 font-bold text-xs sm:text-sm cursor-pointer active:scale-[0.99] bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <Mail size={16} className="text-slate-500" />
                      <span>Имэйл холбох</span>
                    </div>
                    <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Gmail</span>
                  </button>
                </div>
              )}

              {/* Edit Name Block */}
              {editMode === 'name' && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/55 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                    <p className="text-sm font-bold text-slate-800">Хэрэглэгчийн нэр солих</p>
                    <button onClick={() => setEditMode('none')} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer">Буцах</button>
                  </div>
                  
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-500 ml-1">Овог нэр</label>
                      <input 
                        type="text" 
                        value={newRealName}
                        onChange={e => {
                          setNewRealName(e.target.value);
                          setNewUsername(e.target.value);
                        }}
                        className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                        placeholder="Овог нэрээ оруулна уу"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isLoading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition-all flex justify-center items-center cursor-pointer active:scale-95 shadow-xs"
                    >
                      {isLoading ? '...' : 'Хадгалах'}
                    </button>
                    <button 
                      onClick={() => setEditMode('none')}
                      className="flex-1 bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Цуцлах
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Password Block */}
              {editMode === 'password' && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/55 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                    <p className="text-sm font-bold text-slate-800">Нууц үг солих</p>
                    <button onClick={() => setEditMode('none')} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer">Буцах</button>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 ml-1">Шинэ нууц үг</label>
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Шинэ нууц үгээ оруулна уу"
                      className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={handleSavePassword}
                      disabled={isLoading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition-all flex justify-center items-center cursor-pointer active:scale-95 shadow-xs"
                    >
                      {isLoading ? '...' : 'Хадгалах'}
                    </button>
                    <button 
                      onClick={() => setEditMode('none')}
                      className="flex-1 bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Цуцлах
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Email Block */}
              {editMode === 'email' && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/55 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                    <p className="text-sm font-bold text-slate-800">Имэйл холбох</p>
                    <button onClick={() => setEditMode('none')} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer">Буцах</button>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 ml-1">Имэйл хаяг (Gmail)</label>
                    <input 
                      type="email" 
                      placeholder="example@gmail.com"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium font-mono"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={handleSaveEmail}
                      disabled={isLoading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition-all flex justify-center items-center cursor-pointer active:scale-95 shadow-xs"
                    >
                      {isLoading ? '...' : 'Холбох'}
                    </button>
                    <button 
                      onClick={() => setEditMode('none')}
                      className="flex-1 bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Цуцлах
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Logout Drawer Footer */}
            <div className="profile-drawer-footer p-5 border-t border-slate-100 bg-slate-50/70">
              <button 
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2.5 py-3 hover:bg-red-750 bg-red-600 text-white rounded-2xl transition-all font-bold text-sm cursor-pointer active:scale-[0.98] shadow-md shadow-red-600/10 hover:shadow-lg hover:shadow-red-600/20"
              >
                <LogOut size={16} />
                <span>Системээс гарах</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
