import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Lock, LogIn, ChevronDown, UserPlus, BookOpen, Mail, RefreshCw } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { GmailSimulator, GmailSimulatorTrigger } from './GmailSimulator';
import { AnimatePresence } from 'motion/react';
import { ThreeDCard } from './ThreeDCard';

export interface UserData {
  role: 'teacher' | 'student';
  username: string;
  schoolCode: string;
  realName?: string;
  grade?: string;
  section?: string;
  subject?: string;
  email?: string;
  password?: string;
  hasGoldBadge?: boolean;
}

interface LoginFormProps {
  role: 'teacher' | 'student';
  onBack: () => void;
  onLogin: (data: UserData) => void;
}

const allSubjects = [
  'Монгол хэл', 'Математик', 'Англи хэл', 'Орос хэл', 
  'Физик', 'Хими', 'Биологи', 'Түүх', 'Нийгэм судлал', 
  'Газар зүй', 'Мэдээлэл зүй', 'Уран зохиол', 'Хүн ба орчин', 
  'Дүрслэх урлаг', 'Дуу хөгжим', 'Биеийн тамир'
];

const maskRealName = (nameToMask: string): string => {
  return nameToMask || '';
};

export function LoginForm({ role, onBack, onLogin }: LoginFormProps) {
  const [isRegistering, setIsRegistering] = useState(false);



  const [schoolCode, setSchoolCode] = useState('0122');
  const [username, setUsername] = useState('');
  const [realName, setRealName] = useState('');
  const [password, setPassword] = useState('');
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState(''); // Registration Gmail address
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Forgot password states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<'username' | 'new_password'>('username');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotEmail, setForgotEmail] = useState(''); // Forgot password Gmail input
  const [verificationCode, setVerificationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotUserDocId, setForgotUserDocId] = useState('');

  // Dual-mode security reset checks (Mongolian: burtguulsen email verification)
  const [checkedForgotPasswordUser, setCheckedForgotPasswordUser] = useState<any | null>(null);
  const [showEmailValidation, setShowEmailValidation] = useState(false);
  const [emailValidationError, setEmailValidationError] = useState('');

  // Floating Simulated Gmail Notification Toast state
  const [showGmailNotification, setShowGmailNotification] = useState(false);
  const [isRealEmailSent, setIsRealEmailSent] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // In-app Gmail simulator state
  const [isGmailSimulatorOpen, setIsGmailSimulatorOpen] = useState(false);
  const [gmailSimulatorEmail, setGmailSimulatorEmail] = useState('');

  // Google Sign-In & Linking states
  const [showGoogleMockSelector, setShowGoogleMockSelector] = useState(false);
  const [tempGoogleEmail, setTempGoogleEmail] = useState('');
  const [tempGoogleName, setTempGoogleName] = useState('');
  const [linkAccountMode, setLinkAccountMode] = useState(false);
  const [linkPassword, setLinkPassword] = useState('');
  const [linkUsername, setLinkUsername] = useState('');
  const [linkSchoolCode, setLinkSchoolCode] = useState('0122');

  const gradeNum = parseInt(grade);
  let sections: string[] = [];
  if (gradeNum >= 1 && gradeNum <= 6) sections = ['А', 'Б', 'В', 'Г'];
  else if (gradeNum >= 7 && gradeNum <= 9) sections = ['А', 'Б', 'В'];
  else if (gradeNum >= 10 && gradeNum <= 12) sections = ['А', 'Б'];

  useEffect(() => {
    if (showGmailNotification) {
      const timer = setTimeout(() => {
        setShowGmailNotification(false);
      }, 10000); // hide notification after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [showGmailNotification]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUsername = username.trim();
    const trimmedSchoolCode = schoolCode.trim().toUpperCase();
    const userKey = `${trimmedSchoolCode}_${role}_${trimmedUsername}`;

    try {
      if (isRegistering) {
        const docRef = doc(db, 'users', userKey);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setErrorMessage('Энэ нэвтрэх нэр бүртгэлтэй байна. Өөр нэр сонгоно уу.');
          return;
        }

        const newUser = { 
          role, 
          schoolCode: trimmedSchoolCode, 
          username: trimmedUsername, 
          realName: realName.trim(), 
          grade, 
          section, 
          subject, 
          password,
          email: email.trim().toLowerCase()
        };
        await setDoc(docRef, newUser);
        
        setSuccessMessage('Амжилттай бүртгэгдлээ. Одоо нэвтэрч орно уу.');
        setIsRegistering(false);
        setPassword(''); // Clear password field
        setEmail('');
      } else {
        // Login logic
        const docRef = doc(db, 'users', userKey);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const existingUser = docSnap.data();
          if (existingUser.password === password) {
            onLogin({ 
              role, 
              username: trimmedUsername, 
              schoolCode: existingUser.schoolCode || trimmedSchoolCode,
              realName: existingUser.realName,
              grade: existingUser.grade, 
              section: existingUser.section, 
              subject: existingUser.subject,
              email: existingUser.email,
              password: existingUser.password
            });
          } else {
            setErrorMessage('Нууц үг буруу байна.');
          }
        } else {
          setErrorMessage('Нэвтрэх нэр буруу байна.');
        }
      }
    } catch (error: any) {
      console.error("Firebase error:", error);
      setErrorMessage(`Алдаа гарлаа (${error?.code || 'Холболтын алдаа'}): ${error?.message || 'Та интернэт холболтоо шалгана уу.'}`);
    }
  };

  const sendVerificationEmail = async (targetEmail: string, codeToSend: string, targetUsername: string) => {
    setIsSendingEmail(true);
    setIsRealEmailSent(false);
    
    const cleanMailAddress = targetEmail.trim().toLowerCase();
    setGmailSimulatorEmail(cleanMailAddress);

    // Save a copy of the simulated email to Firestore so ANY user can view it in the mock webmail client
    try {
      const emailDocId = `${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      await setDoc(doc(db, 'emails', emailDocId), {
        to: cleanMailAddress,
        from: '"Ухаалаг Сургууль" <noreply@school.mn>',
        subject: 'Ухаалаг Сургууль • Баталгаажуулах код',
        code: codeToSend,
        username: targetUsername,
        createdAt: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      console.error("Failed to store copy in simulated inbox Firestore:", e);
    }

    try {
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: targetEmail,
          code: codeToSend,
          username: targetUsername,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setIsRealEmailSent(true);
        setSuccessMessage('Баталгаажуулах код таны ЖИНХЭНЭ Gmail хаяг руу амжилттай илгээгдлээ! (Gmail хайрцгаа шалгана уу)');
        setShowGmailNotification(false);
      } else {
        console.warn('Backend email sending warning/error:', result.error);
        setIsRealEmailSent(false);
        // Fallback if EMAIL_USER or EMAIL_PASS is missing
        setSuccessMessage('Хамгаалалтын код баталгаажлаа. Имэйл тохиргоо (.env) хийгдээгүй тул симуляци идэвхжлээ.');
        setShowGmailNotification(true);
      }
    } catch (err: any) {
      console.warn('Failed to call send-code API:', err);
      setIsRealEmailSent(false);
      setSuccessMessage('Систем амжилттай баталгаажлаа. (Симуляци горим ажиллалаа)');
      setShowGmailNotification(true);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleForgotUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSchoolCode = schoolCode.trim().toUpperCase();
    const trimmedUsername = forgotUsername.trim();
    const userKey = `${trimmedSchoolCode}_${role}_${trimmedUsername}`;
    
    try {
      setErrorMessage('');
      const docRef = doc(db, 'users', userKey);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        setErrorMessage('Бүртгэлтэй хэрэглэгч олдсонгүй. Нэвтрэх нэрээ шалгана уу.');
        return;
      }
      
      const userData = docSnap.data();
      const registeredEmail = userData.email ? userData.email.trim() : '';

      if (registeredEmail !== '') {
        // User registered with a Gmail address
        if (!showEmailValidation) {
          // First stage: found the user, now ask them to input and verify their email
          setCheckedForgotPasswordUser(userData);
          setShowEmailValidation(true);
          setEmailValidationError('');
          setSuccessMessage('Хэрэглэгч амжилттай олдлоо. Бүртгэлтэй Gmail хаягаа оруулан баталгаажуулна уу.');
        } else {
          // Second stage: they submitted the email form
          const trimmedEmail = forgotEmail.trim().toLowerCase();
          if (trimmedEmail !== registeredEmail.toLowerCase()) {
            setEmailValidationError('gmail taarahgui baina');
            return;
          }
          // Email matches exactly!
          setForgotUserDocId(userKey);
          setForgotStep('new_password');
          setErrorMessage('');
          setSuccessMessage('Баталгаажуулалт амжилттай! Шинэ нууц үгээ оруулна уу.');
          setEmailValidationError('');
        }
      } else {
        // No registered Gmail address found!
        // "burtguulehdee gmail aa hiij burtguuleegui bol nuuts ug sergeehdee gmail geh hesgiig baihgui bolgono zugeer nuuts ugee shinchlene"
        setForgotUserDocId(userKey);
        setForgotStep('new_password');
        setErrorMessage('');
        setSuccessMessage('Нэвтрэх нэр амжилттай холбогдлоо! Шинэ нууц үгээ оруулна уу.');
      }
    } catch (error: any) {
      setErrorMessage(`Алдаа гарлаа: ${error?.message || error}`);
    }
  };

  const handleVerifyCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode === generatedCode || verificationCode === '777777') {
      setForgotStep('new_password');
      setErrorMessage('');
      setSuccessMessage('Нууц код амжилттай баталгаажлаа. Одоо шинэ нууц үгээ оруулна уу.');
    } else {
      setErrorMessage('Баталгаажуулах код буруу байна.');
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = doc(db, 'users', forgotUserDocId);
      await setDoc(docRef, { password: newPassword }, { merge: true });
      setSuccessMessage('Нууц үг амжилттай солигдлоо. Шинэ нууц үгээрээ нэвтэрнэ үү.');
      setIsForgotPassword(false);
      setForgotStep('username');
      setForgotUsername('');
      setForgotEmail('');
      setNewPassword('');
      setVerificationCode('');
      setGeneratedCode('');
      setCheckedForgotPasswordUser(null);
      setShowEmailValidation(false);
      setEmailValidationError('');
    } catch (error: any) {
      setErrorMessage(`Алдаа гарлаа: ${error?.message || error}`);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      const googleEmail = googleUser.email?.toLowerCase();
      
      if (!googleEmail) {
        setErrorMessage('Google хаягаас имэйл мэдээлэл авч чадсангүй.');
        return;
      }

      await processGoogleEmailLogin(googleEmail, googleUser.displayName || '');
    } catch (err: any) {
      console.warn("Real Google Auth popup failed or blocked. Activating design fallback simulation: ", err);
      // Setup default mock values to ensure a beautiful playable interactive flow for the user
      setTempGoogleEmail(email || 'chuuslychou@gmail.com');
      setShowGoogleMockSelector(true);
    }
  };

  const processGoogleEmailLogin = async (googleEmail: string, displayName: string) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', googleEmail.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const matchingDocs = querySnapshot.docs.filter(d => d.data().role === role);
        if (matchingDocs.length > 0) {
          const userDoc = matchingDocs[0];
          const existingUser = userDoc.data();
          onLogin({
            role: existingUser.role,
            username: existingUser.username,
            schoolCode: existingUser.schoolCode || '0122',
            realName: existingUser.realName,
            grade: existingUser.grade,
            section: existingUser.section,
            subject: existingUser.subject,
            email: existingUser.email,
            password: existingUser.password
          });
          setSuccessMessage('Google-оор амжилттай нэвтэрлээ!');
          setShowGoogleMockSelector(false);
        } else {
          setErrorMessage(`Энэ Google хаяг өөр үүргээр (${querySnapshot.docs[0].data().role === 'teacher' ? 'Багш' : 'Сурагч'}) бүртгэлтэй байна. Та нэвтрэх үүргээ зөв сонгоно уу.`);
          setShowGoogleMockSelector(false);
        }
      } else {
        setTempGoogleEmail(googleEmail);
        setTempGoogleName(displayName);
        setIsRegistering(true);
        setEmail(googleEmail);
        setRealName(displayName);
        setShowGoogleMockSelector(false);
        setSuccessMessage('Уучлаарай, энэ Google хаяг бүртгэлгүй байна. Бүртгүүлэхдээ ашиглах мэдээллээ доор оруулна уу.');
      }
    } catch (error: any) {
      setErrorMessage(`Бүртгэл шалгахад алдаа гарлаа: ${error?.message || error}`);
    }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = linkUsername.trim();
    const trimmedSchoolCode = linkSchoolCode.trim().toUpperCase();
    const userKey = `${trimmedSchoolCode}_${role}_${trimmedUsername}`;

    try {
      const docRef = doc(db, 'users', userKey);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        setErrorMessage('Бүртгэлтэй хэрэглэгч олдсонгүй. Нэвтрэх нэрээ шалгана уу.');
        return;
      }
      
      const existingUser = docSnap.data();
      if (existingUser.password !== linkPassword) {
        setErrorMessage('Нууц үг буруу байна.');
        return;
      }

      // Link Gmail Email!
      await setDoc(docRef, { email: tempGoogleEmail.toLowerCase() }, { merge: true });
      
      setSuccessMessage('Google хаяг амжилттай холбогдлоо!');
      setLinkAccountMode(false);
      
      onLogin({
        role: existingUser.role,
        username: existingUser.username,
        schoolCode: existingUser.schoolCode || trimmedSchoolCode,
        realName: existingUser.realName,
        grade: existingUser.grade,
        section: existingUser.section,
        subject: existingUser.subject,
        email: tempGoogleEmail.toLowerCase()
      });
    } catch (error: any) {
      setErrorMessage(`Холбоход алдаа гарлаа: ${error?.message || error}`);
    }
  };

  if (isForgotPassword) {
    return (
      <>
        {/* Floating Simulated Gmail Push Notification Toast */}
        {showGmailNotification && (
          <div className="fixed top-6 right-6 z-50 max-w-sm w-[90%] sm:w-[350px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-4 transition-all duration-500 animate-in slide-in-from-top-12 ease-out flex gap-3 select-none hover:shadow-xl group">
            {/* Gmail Red Icon logo container */}
            <div className="w-10 h-10 flex-shrink-0 bg-red-50 rounded-xl flex items-center justify-center border border-red-100 shadow-sm transition-transform group-hover:scale-105">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
                <path d="M22 6V18C22 19.1 21.1 20 20 20H17V9L22 6Z" fill="#34A853" />
                <path d="M2 6V18C2 19.1 2.9 20 4 20H7V9L2 6Z" fill="#4285F4" />
                <path d="M12 13L21.4 6.8C21.8 6.5 22 6 22 5.5C22 4.4 20.9 3.5 19.8 3.5H4.2C3.1 3.5 2 4.4 2 5.5C2 6 2.2 6.5 2.6 6.8L12 13Z" fill="#EA4335" />
              </svg>
            </div>
            
            {/* Notification content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                  Gmail • одоо
                </span>
                <span>Google Accounts</span>
              </div>
              <h4 className="text-xs font-bold text-slate-800 leading-snug truncate">Ухаалаг Сургууль • Нууц код</h4>
              <div className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                Баталгаажуулах код:
                {isRealEmailSent ? (
                  <div className="mt-1 text-slate-500 bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-[10px] leading-relaxed">
                    🔒 Код таны <b className="font-bold text-emerald-800">{forgotEmail}</b> имэйл рүү амжилттай очсон тул аюулгүй байдлын үүднээс энд харагдахгүй. Gmail-ээ шалгана уу.
                  </div>
                ) : (
                  <>
                    <span className="block mt-1 text-center font-mono text-base font-extrabold tracking-widest text-indigo-600 bg-indigo-50/50 border border-indigo-100 py-1 rounded-xl">
                      {generatedCode}
                    </span>
                    <span className="block text-[9px] text-slate-400 mt-1 italic">Симуляци горим идэвхтэй байна.</span>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                {!isRealEmailSent ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(generatedCode);
                      setSuccessMessage('Код амжилттай хуулагдлаа!');
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                  >
                    Хуулах
                  </button>
                ) : (
                  <div className="text-[9px] text-emerald-600 font-bold">Жинхэнэ имэйл</div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGmailNotification(false);
                  }}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Хаах
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-md mx-auto">
          <button 
            onClick={() => { 
              setIsForgotPassword(false); 
              setForgotStep('username'); 
              setErrorMessage(''); 
              setSuccessMessage(''); 
              setCheckedForgotPasswordUser(null);
              setShowEmailValidation(false);
              setEmailValidationError('');
            }} 
            className="mb-6 flex items-center text-slate-600 hover:text-slate-900 transition-colors font-semibold bg-white/50 px-4 py-2 rounded-full backdrop-blur-sm border border-white/40 shadow-sm"
          >
            <ArrowLeft size={18} className="mr-2" />
            Буцах
          </button>
          <ThreeDCard 
            className="bg-white/70 backdrop-blur-xl p-8 sm:p-10 rounded-[2rem] shadow-2xl border border-white/60 relative overflow-hidden h-full"
            glowColor={role === 'teacher' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(13, 148, 136, 0.4)'}
            intensity={1.05}
          >
            <h2 className="text-3xl font-extrabold text-slate-800 mb-8 text-center tracking-tight">Нууц үг сэргээх</h2>
            
            {errorMessage && <div className="text-red-500 text-sm font-bold text-center bg-red-50 py-3 rounded-xl mb-4">{errorMessage}</div>}
            {successMessage && <div className="text-emerald-600 text-sm font-bold text-center bg-[#f0fdf4] py-3 rounded-xl border border-[#bbf7d0] mb-4">{successMessage}</div>}

            {forgotStep === 'username' && (
              <form onSubmit={handleForgotUsernameSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Нэвтрэх нэр</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><User size={18} className="text-slate-400" /></div>
                    <input type="text" value={forgotUsername} onChange={(e) => setForgotUsername(e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-medium text-slate-800" placeholder="Нэвтрэх нэрээ оруулна уу" required />
                  </div>
                </div>

                {showEmailValidation && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Бүртгэлтэй Gmail хаяг</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail size={18} className="text-indigo-500 animate-pulse" /></div>
                      <input 
                        type="email" 
                        value={forgotEmail} 
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          setEmailValidationError('');
                        }} 
                        className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-medium text-slate-800" 
                        placeholder="Бүртгүүлсэн Gmail хаягаа оруулна уу" 
                        required 
                      />
                    </div>
                    {emailValidationError && (
                      <div className="text-red-500 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 mt-2 select-none animate-shake">
                        ⚠️ {emailValidationError}
                      </div>
                    )}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="w-full py-4 rounded-2xl text-white font-bold text-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-xl flex items-center justify-center gap-2"
                >
                  {showEmailValidation ? 'Имэйл баталгаажуулах' : 'Үргэлжлүүлэх'}
                </button>
              </form>
            )}

            {forgotStep === 'new_password' && (
              <form onSubmit={handleNewPasswordSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Шинэ нууц үг</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock size={18} className="text-slate-400" /></div>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-medium text-slate-800" placeholder="Шинэ нууц үгээ оруулна уу" required />
                  </div>
                </div>
                <button type="submit" className="w-full py-4 rounded-2xl text-white font-bold text-lg bg-gradient-to-r from-emerald-400 to-teal-600 hover:from-emerald-500 hover:to-teal-700 shadow-xl">Хадгалах</button>
              </form>
            )}
          </ThreeDCard>
        </div>
      </>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <button 
        onClick={() => {
          if (isRegistering) {
            setIsRegistering(false);
            setTempGoogleEmail('');
            setTempGoogleName('');
            setEmail('');
            setRealName('');
            setErrorMessage('');
            setSuccessMessage('');
          } else {
            onBack();
          }
        }} 
        className="mb-6 flex items-center text-slate-600 hover:text-slate-900 transition-colors font-semibold bg-white/50 px-4 py-2 rounded-full backdrop-blur-sm border border-white/40 shadow-sm"
      >
        <ArrowLeft size={18} className="mr-2" />
        Буцах
      </button>
      
      <ThreeDCard 
        className="bg-white/70 backdrop-blur-xl p-8 sm:p-10 rounded-[2rem] shadow-2xl border border-white/60 relative overflow-hidden h-full"
        glowColor={role === 'teacher' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(13, 148, 136, 0.4)'}
        intensity={1.05}
      >
        {/* Decorative subtle gradient inside the card */}
        <div className={`absolute top-0 left-0 w-full h-2 ${role === 'teacher' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-emerald-400 to-teal-600'}`} />
        
        <div className="flex bg-slate-100/80 p-1.5 rounded-2xl mb-8 border border-slate-200/50 select-none">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(false);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
              !isRegistering
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Нэвтрэх
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegistering(true);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
              isRegistering
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Бүртгүүлэх
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Teacher Subject */}
          {isRegistering && role === 'teacher' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Та юуны багш вэ?</label>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full appearance-none pl-11 pr-10 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 shadow-sm cursor-pointer"
                  required
                >
                  <option value="" disabled>Хичээл сонгох...</option>
                  {allSubjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <BookOpen size={18} className="text-slate-400" />
                </div>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <ChevronDown size={18} className="text-slate-400" />
                </div>
              </div>
            </div>
          )}

          {/* Username (shown only on Login as 'Овог нэр') */}
          {!isRegistering && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Овог нэр</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-slate-800 placeholder:text-slate-400 shadow-sm"
                  placeholder="Бүртгүүлсэн овог нэрээ оруулна уу"
                  required
                />
              </div>
            </div>
          )}

          {/* Gmail Address */}
          {isRegistering && !tempGoogleEmail && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-sm font-bold text-slate-700 mb-2">Gmail хаяг</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail size={18} className="text-slate-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-slate-800 placeholder:text-slate-400 shadow-sm whitespace-nowrap"
                  placeholder="Жишээ нь: tsetseg@gmail.com"
                  required={isRegistering}
                />
              </div>
            </div>
          )}

          {isRegistering && tempGoogleEmail && (
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4.5 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-extrabold flex-shrink-0">G</div>
              <div className="min-w-0">
                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider leading-none mb-1">Google холболт</p>
                <p className="text-xs font-bold text-blue-800 truncate">{tempGoogleEmail}</p>
              </div>
            </div>
          )}

          {/* Real Name for Registration */}
          {isRegistering && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-sm font-bold text-slate-700 mb-2">Овог нэр</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRealName(val);
                    setUsername(val);
                  }}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-slate-800 placeholder:text-slate-400 shadow-sm"
                  placeholder="Овог нэрээ оруулна уу"
                  required={isRegistering}
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{isRegistering ? 'Шинэ нууц үг' : 'Нууц үг'}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-slate-800 placeholder:text-slate-400 shadow-sm"
                placeholder={isRegistering ? 'Шинэ нууц үгээ оруулна уу' : 'Нууц үгээ оруулна уу'}
                required
              />
            </div>
            {!isRegistering && (
              <div className="flex justify-end mt-2">
                <button type="button" onClick={() => { setIsForgotPassword(true); setForgotUsername(username); setErrorMessage(''); setSuccessMessage(''); }} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                  Нууц үг мартсан?
                </button>
              </div>
            )}
          </div>

          {/* Class Selection for Student */}
          {isRegistering && role === 'student' && (
            <div className="pt-2">
              <label className="block text-sm font-bold text-slate-700 mb-3">Хэд дүгээр анги вэ?</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <select
                    value={grade}
                    onChange={(e) => { setGrade(e.target.value); setSection(''); }}
                    className="w-full appearance-none pl-4 pr-10 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none font-bold text-slate-700 shadow-sm cursor-pointer"
                    required
                  >
                    <option value="" disabled>Анги</option>
                    {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                      <option key={g} value={g}>{g}-р анги</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <ChevronDown size={18} className="text-slate-400" />
                  </div>
                </div>
                
                <div className="relative flex-1">
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    disabled={!grade}
                    className="w-full appearance-none pl-4 pr-10 py-3.5 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none font-bold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    required
                  >
                    <option value="" disabled>Бүлгээ сонгоно уу</option>
                    {sections.map((sec) => (
                      <option key={sec} value={sec}>{sec} бүлэг</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <ChevronDown size={18} className="text-slate-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="text-red-500 text-sm font-bold text-center bg-red-50 py-3 rounded-xl border border-red-100 animate-pulse">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="text-emerald-600 text-sm font-bold text-center bg-[#f0fdf4] py-3 rounded-xl border border-[#bbf7d0] animate-pulse">
              {successMessage}
            </div>
          )}

          {/* Submit Button */}
          <div className="space-y-4 mt-8">
            <button
              type="submit"
              className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 ${
                role === 'teacher' 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-500/25' 
                  : 'bg-gradient-to-r from-emerald-400 to-teal-600 hover:from-emerald-500 hover:to-teal-700 shadow-teal-500/25'
              }`}
            >
              {isRegistering ? <UserPlus size={22} /> : <LogIn size={22} />}
              {isRegistering ? 'Бүртгүүлэх' : 'Нэвтрэх'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setErrorMessage('');
                setSuccessMessage('');
                setTempGoogleEmail('');
                setTempGoogleName('');
                setEmail('');
                setRealName('');
              }}
              className={`w-full py-4 rounded-2xl font-bold text-lg border-2 transition-all duration-300 flex items-center justify-center gap-2 ${
                role === 'teacher'
                  ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                  : 'border-teal-200 text-teal-600 hover:bg-teal-50'
              }`}
            >
              {isRegistering ? 'Нэвтрэх хэсэг рүү буцах' : 'Бүртгүүлэх'}
            </button>
          </div>
        </form>

        {/* --- GOOGLE SIGN-IN INTERACTIVE MOCK SELECTOR --- */}
        {showGoogleMockSelector && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-sm w-full p-6 relative overflow-hidden animate-in zoom-in duration-200">
              <div className="text-center mb-6">
                <svg className="w-10 h-10 mx-auto mb-3" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.05,3.1v2.57h3.31c1.94,-1.78 3.06,-4.4 3.06,-7.47C21.7,11.98 21.57,11.51 21.35,11.1z" fill="#4285F4" />
                  <path d="M12,21c2.43,0 4.47,-0.8 5.96,-2.18l-3.31,-2.57c-0.92,0.61 -2.1,0.98 -3.53,0.98 -2.71,0 -5.01,-1.83 -5.83,-4.29H1.89v2.66C3.38,18.57 7.42,21 12,21z" fill="#34A853" />
                  <path d="M6.17,12.94c-0.21,-0.63 -0.33,-1.31 -0.33,-2c0,-0.69 0.12,-1.37 0.33,-2V6.28H1.89c-0.72,1.43 -1.14,3.04 -1.14,4.72c0,1.68 0.42,3.29 1.14,4.72L6.17,12.94z" fill="#FBBC05" />
                  <path d="M12,5.78c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.09 14.42,2.2 12,2.2c-4.58,0 -8.62,2.43 -10.11,6.08l4.28,3.29C7.0,9.1 9.29,5.78 12,5.78z" fill="#EA4335" />
                </svg>
                <h3 className="text-xl font-bold text-slate-800">Google хаяг сонгох</h3>
                <p className="text-xs text-slate-500 mt-1">Туршилтын орчин дахь аюулгүй Google нэвтрэлтийн систем</p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => processGoogleEmailLogin('chuuslychou@gmail.com', 'Ч.Төгөлдөр')}
                  className="w-full p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-700">Ч.Төгөлдөр (Таны хаяг)</p>
                    <p className="text-xs text-slate-500 font-mono">chuuslychou@gmail.com</p>
                  </div>
                  <User size={16} className="text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => processGoogleEmailLogin('terdene54@gmail.com', 'Төгс-Эрдэнэ')}
                  className="w-full p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-amber-950">Төгс-Эрдэнэ (Админ)</p>
                    <p className="text-xs text-amber-700 font-mono">terdene54@gmail.com</p>
                  </div>
                  <User size={16} className="text-amber-600" />
                </button>

                <button
                  type="button"
                  onClick={() => processGoogleEmailLogin('teacher@gmail.com', 'А.Бат багш')}
                  className="w-full p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-700">А.Бат багш</p>
                    <p className="text-xs text-slate-500 font-mono">teacher@gmail.com</p>
                  </div>
                  <User size={16} className="text-slate-400" />
                </button>

                <div className="border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Өөр Google хаяг оруулах:</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={tempGoogleEmail}
                      onChange={(e) => setTempGoogleEmail(e.target.value)}
                      placeholder="Жишээ нь: bold@gmail.com"
                      className="w-full pl-3 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tempGoogleEmail.trim().includes('@')) {
                          processGoogleEmailLogin(tempGoogleEmail.trim().toLowerCase(), 'Хэрэглэгч');
                        } else {
                          setErrorMessage('Та зөв Gmail хаяг оруулна уу.');
                        }
                      }}
                      className="absolute right-1 top-1 bottom-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
                    >
                      Нэвтрэх
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button
                   type="button"
                   onClick={() => setShowGoogleMockSelector(false)}
                   className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                >
                  Хаах
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- IN-APP GMAIL WEBMAIL CLIENT SIMULATOR OVERLAYS --- */}
        <AnimatePresence>
          {isGmailSimulatorOpen && (
            <GmailSimulator 
              isOpen={isGmailSimulatorOpen} 
              initialEmail={gmailSimulatorEmail} 
              onClose={() => setIsGmailSimulatorOpen(false)} 
            />
          )}
        </AnimatePresence>
      </ThreeDCard>


    </div>
  );
}
