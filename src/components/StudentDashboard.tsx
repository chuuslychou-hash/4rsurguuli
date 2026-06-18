import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LogOut, BookOpen, UploadCloud, CheckCircle2, ChevronRight, Image as ImageIcon, PlayCircle, FileText, Download, Presentation, Award, Lock, Unlock, Loader2, Calendar, FileSpreadsheet, Star, Check, X } from 'lucide-react';
import { UserData } from './LoginForm';
import { db, storage } from '../firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ProfileDropdown } from './ProfileDropdown';
import { ChatSystem } from './ChatSystem';
import { ThreeDCard } from './ThreeDCard';

interface StudentDashboardProps {
  user: UserData;
  onLogout: () => void;
  onUpdateUser: (user: UserData) => void;
}

const getSubjectsForGrade = (gradeStr?: string) => {
  const grade = parseInt(gradeStr || '1');
  if (grade <= 5) return ['Монгол хэл', 'Математик', 'Хүн ба орчин', 'Дүрслэх урлаг', 'Дуу хөгжим', 'Биеийн тамир'];
  if (grade <= 9) return ['Монгол хэл', 'Математик', 'Англи хэл', 'Орос хэл', 'Физик', 'Хими', 'Биологи', 'Түүх', 'Газар зүй', 'Мэдээлэл зүй', 'Уран зохиол'];
  return ['Монгол хэл', 'Математик', 'Англи хэл', 'Физик', 'Хими', 'Биологи', 'Түүх', 'Нийгэм судлал', 'Мэдээлэл зүй', 'Уран зохиол'];
};

export function StudentDashboard({ user, onLogout, onUpdateUser }: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'lessons' | 'assignments' | 'grades' | 'quizzes' | 'chat'>('home');
  
  // Quiz / Test States
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(false);
  const [quizzesView, setQuizzesView] = useState<'menu' | 'attempt'>('menu');
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [quizSubmissions, setQuizSubmissions] = useState<any[]>([]); // To track already completed submissions

  // Taking active quiz states
  const [curQuizQuestionIdx, setCurQuizQuestionIdx] = useState(0);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, { selected: number, isCorrect: boolean }>>({}); // questionId -> result
  const [feedbackState, setFeedbackState] = useState<'idle' | 'showing_result' | 'finished'>('idle'); 
  
  // Gradebook States
  const [gradesSubject, setGradesSubject] = useState('');
  const [gradesTeacher, setGradesTeacher] = useState('');
  const [myGradesList, setMyGradesList] = useState<any[]>([]);
  const [gradesVisibility, setGradesVisibility] = useState(false);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [gradesColumns, setGradesColumns] = useState<any[]>([]);
  
  // Lesson state
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [lessons, setLessons] = useState<any[]>([]);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [currentLessonTitle, setCurrentLessonTitle] = useState('');
  const [currentLesson, setCurrentLesson] = useState<any | null>(null);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);
  
  // Assignment state
  const [assignmentView, setAssignmentView] = useState<'menu' | 'view' | 'submit' | 'view_sent'>('menu');
  const [assignSubject, setAssignSubject] = useState('');
  const [assignTeacher, setAssignTeacher] = useState('');
  const [viewAssignSubject, setViewAssignSubject] = useState('');
  const [viewAssignTeacher, setViewAssignTeacher] = useState('');
  
  // Submission states
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [isUploadingSubmission, setIsUploadingSubmission] = useState(false);
  const [uploadSubmissionProgress, setUploadSubmissionProgress] = useState(0);
  const [isSent, setIsSent] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Sent submissions state
  const [sentSubmissions, setSentSubmissions] = useState<any[]>([]);
  const [isLoadingSentSubmissions, setIsLoadingSentSubmissions] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  useEffect(() => {
    if (assignmentView === 'view' && viewAssignSubject && viewAssignTeacher) {
      setIsLoadingAssignments(true);
      const q = query(collection(db, 'assignments'), where('teacher', '==', viewAssignTeacher));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(a => a.subject === viewAssignSubject && a.className === `${user.grade}${user.section}`);
        
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        
        setAssignments(fetched);
        setIsLoadingAssignments(false);
      }, (error) => {
        console.error("Error fetching assignments:", error);
        setIsLoadingAssignments(false);
      });
      return () => unsubscribe();
    }
  }, [assignmentView, viewAssignSubject, viewAssignTeacher, user.grade, user.section]);

  useEffect(() => {
    if (selectedSubject && selectedTeacher) {
      setIsLoadingLessons(true);
      const q = query(collection(db, 'lessons'), where('teacher', '==', selectedTeacher));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(l => l.subject === selectedSubject && l.className === `${user.grade}${user.section}`);
        
        // Sort by createdAt descending in memory to avoid needing a composite index
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        
        setLessons(fetched);
        setIsLoadingLessons(false);
      }, (error) => {
        console.error("Error fetching lessons:", error);
        setIsLoadingLessons(false);
      });
      return () => unsubscribe();
    }
  }, [selectedSubject, selectedTeacher, user.grade, user.section]);

  const [teachersList, setTeachersList] = useState<any[]>([]);

  useEffect(() => {
    const fetchTeachers = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
        const snapshot = await getDocs(q);
        const fetchedTeachers = snapshot.docs
          .map(doc => doc.data());
        setTeachersList(fetchedTeachers);
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchTeachers();
  }, []);

  const getTeacherRealName = (username: string) => {
    if (!username) return '';
    const found = teachersList.find(t => t.username === username);
    return found ? (found.realName || found.username) : username;
  };

  // --- Gradebook (Excel) Student Sync Hook ---
  useEffect(() => {
    if (activeTab === 'grades' && gradesSubject && gradesTeacher) {
      setIsLoadingGrades(true);
      const studentClass = `${user.grade}${user.section}`;

      // 1. Fetch Lessons
      const qLessons = query(
        collection(db, 'lessons'),
        where('teacher', '==', gradesTeacher),
        where('className', '==', studentClass),
        where('subject', '==', gradesSubject)
      );

      // 2. Fetch Assignments
      const qAssignments = query(
        collection(db, 'assignments'),
        where('teacher', '==', gradesTeacher),
        where('className', '==', studentClass),
        where('subject', '==', gradesSubject)
      );

      // 3. Fetch user's individual Grades in this class/subject/teacher
      const qGrades = query(
        collection(db, 'grades'),
        where('className', '==', studentClass),
        where('subject', '==', gradesSubject),
        where('teacher', '==', gradesTeacher),
        where('studentUsername', '==', user.username)
      );

      // 4. Fetch Visibility
      const docId = `${studentClass}_${gradesSubject}_${gradesTeacher}`;
      const unsubscribeVisibility = onSnapshot(doc(db, 'grade_visibility', docId), (docSnap) => {
        if (docSnap.exists()) {
          setGradesVisibility(docSnap.data().published || false);
        } else {
          setGradesVisibility(false);
        }
      });

      // Assemble columns and match with grades reactively
      const unsubscribeLessons = onSnapshot(qLessons, (lessonsSnap) => {
        const fetchedLessons = lessonsSnap.docs.map(d => ({
          id: d.id,
          title: d.data().title || 'Хичээл',
          type: 'lesson',
          createdAt: d.data().createdAt
        }));

        unsubscribeAssignmentsListen(fetchedLessons);
      });

      let unsubscribeAssignments: any = null;
      const unsubscribeAssignmentsListen = (fetchedLessons: any[]) => {
        if (unsubscribeAssignments) unsubscribeAssignments();

        unsubscribeAssignments = onSnapshot(qAssignments, (assignSnap) => {
          const fetchedAssigns = assignSnap.docs.map(d => ({
            id: d.id,
            title: d.data().title || 'Даалгавар',
            type: 'assignment',
            createdAt: d.data().createdAt
          }));

          const combined = [...fetchedLessons, ...fetchedAssigns];
          combined.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeA - timeB;
          });
          setGradesColumns(combined);
        });
      };

      const unsubscribeGrades = onSnapshot(qGrades, (gradesSnap) => {
        const list = gradesSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setMyGradesList(list);
        setIsLoadingGrades(false);
      });

      return () => {
        unsubscribeVisibility();
        unsubscribeLessons();
        if (unsubscribeAssignments) unsubscribeAssignments();
        unsubscribeGrades();
      };
    } else {
      setIsLoadingGrades(false);
    }
  }, [activeTab, gradesSubject, gradesTeacher, user.username, user.grade, user.section]);

  // Synchronize Quizzes for student's class
  useEffect(() => {
    if (activeTab === 'quizzes' && user.grade && user.section) {
      setIsLoadingQuizzes(true);
      const studentClassName = `${user.grade}${user.section}`;
      const q = query(
        collection(db, 'quizzes'),
        where('className', '==', studentClassName)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setQuizzes(list);
        setIsLoadingQuizzes(false);
      }, (error) => {
        console.error("Quizzes fetch error for student:", error);
        setIsLoadingQuizzes(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab, user.grade, user.section]);

  // Synchronize quiz submissions to check which quizzes are already completed
  useEffect(() => {
    if (activeTab === 'quizzes' && user.username) {
      const q = query(
        collection(db, 'quiz_submissions'),
        where('studentUsername', '==', user.username)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
        setQuizSubmissions(list);

        // Retroactively sync gold badge
        const hasPassedAt90 = list.some(sub => sub.totalQuestions > 0 && ((sub.score / sub.totalQuestions) * 100) >= 90);
        if (hasPassedAt90 && !user.hasGoldBadge) {
          const userKey = `${user.schoolCode}_${user.role}_${user.username}`;
          updateDoc(doc(db, 'users', userKey), {
            hasGoldBadge: true
          }).catch(err => console.error("Error setting gold badge auto-sync:", err));
          
          onUpdateUser({
            ...user,
            hasGoldBadge: true
          });
        }
      }, (error) => {
        console.error("Quiz submissions fetch error for student:", error);
      });
      return () => unsubscribe();
    }
  }, [activeTab, user.username, user.hasGoldBadge]);

  const handleSelectQuizAnswerVal = (optionIdx: number) => {
    if (!activeQuiz) return;
    const currentQ = activeQuiz.questions[curQuizQuestionIdx];
    if (!currentQ) return;
    
    // Disable re-answering a question once chosen
    if (submittedAnswers[currentQ.id]) return;

    const isCorrect = optionIdx === currentQ.correctAnswer;
    
    // Save response immediately for instant visual coloring feedback
    const updatedSubmitted = {
      ...submittedAnswers,
      [currentQ.id]: { selected: optionIdx, isCorrect }
    };
    setSubmittedAnswers(updatedSubmitted);
  };

  const handleNextQuizQuestion = () => {
    if (curQuizQuestionIdx < activeQuiz.questions.length - 1) {
      setCurQuizQuestionIdx(curQuizQuestionIdx + 1);
    } else {
      handleSubmitQuizResultBlock();
    }
  };

  const handleSubmitQuizResultBlock = async () => {
    if (!activeQuiz) return;
    
    let score = 0;
    activeQuiz.questions.forEach((q: any) => {
      const ans = submittedAnswers[q.id];
      if (ans && ans.isCorrect) {
        score++;
      }
    });

    const percent = activeQuiz.questions.length > 0 ? (score / activeQuiz.questions.length) * 100 : 0;
    const isGoldAwarded = percent >= 90;

    try {
      await addDoc(collection(db, 'quiz_submissions'), {
        quizId: activeQuiz.id,
        quizTitle: activeQuiz.title,
        subject: activeQuiz.subject,
        teacher: activeQuiz.teacher,
        studentUsername: user.username,
        studentName: user.realName || user.username,
        className: `${user.grade}${user.section}`,
        score,
        totalQuestions: activeQuiz.questions.length,
        submittedAnswers,
        createdAt: serverTimestamp()
      });

      if (isGoldAwarded) {
        const userKey = `${user.schoolCode}_${user.role}_${user.username}`;
        await updateDoc(doc(db, 'users', userKey), {
          hasGoldBadge: true
        });
        
        onUpdateUser({
          ...user,
          hasGoldBadge: true
        });
        
        setFeedbackState('finished');
        setSuccessToast('Баяр хүргэе! Та 90-ээс дээш хувийн амжилт үзүүлж АЛТАН БАДЖ авлаа! 🏆');
      } else {
        setFeedbackState('finished');
        setSuccessToast('Сорилтын хариу хадгалагдлаа!');
      }
    } catch (err) {
      console.error("Error submitting quiz:", err);
      alert('Шалгалт хадгалахад алдаа гарлаа: ' + err);
    }
  };

  const subjects = getSubjectsForGrade(user.grade);
  
  // Get teachers for the currently selected subject in Lessons view
  const currentLessonTeachers = selectedSubject 
    ? teachersList.filter(t => t.subject === selectedSubject).map(t => ({ username: t.username, realName: t.realName || t.username }))
    : [];
  if (selectedSubject && currentLessonTeachers.length === 0) currentLessonTeachers.push({ username: 'Багш томилогдоогүй', realName: 'Багш томилогдоогүй' });
  
  // Get teachers for the currently selected subject in Assignments view
  const currentAssignTeachers = assignSubject 
    ? teachersList.filter(t => t.subject === assignSubject).map(t => ({ username: t.username, realName: t.realName || t.username }))
    : [];
  if (assignSubject && currentAssignTeachers.length === 0) currentAssignTeachers.push({ username: 'Багш томилогдоогүй', realName: 'Багш томилогдоогүй' });

  // Get teachers for the currently selected subject in Assignments view (view mode)
  const currentViewAssignTeachers = viewAssignSubject 
    ? teachersList.filter(t => t.subject === viewAssignSubject).map(t => ({ username: t.username, realName: t.realName || t.username }))
    : [];
  if (viewAssignSubject && currentViewAssignTeachers.length === 0) currentViewAssignTeachers.push({ username: 'Багш томилогдоогүй', realName: 'Багш томилогдоогүй' });

  useEffect(() => {
    if (assignmentView === 'view_sent') {
      setIsLoadingSentSubmissions(true);
      const q = query(collection(db, 'student_submissions'), where('studentUsername', '==', user.username));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        setSentSubmissions(fetched);
        setIsLoadingSentSubmissions(false);
      }, (error) => {
        console.error("Error fetching sent submissions:", error);
        setIsLoadingSentSubmissions(false);
      });
      return () => unsubscribe();
    }
  }, [assignmentView, user.username]);

  const handleSubmitAssignment = async () => {
    if (!submissionFile || !assignSubject || !assignTeacher) {
      alert('Мэдээллийг бүрэн бөглөнө үү!');
      return;
    }
    setIsUploadingSubmission(true);
    setUploadSubmissionProgress(0);

    const fallbackLocalUpload = async () => {
      try {
        setUploadSubmissionProgress(100);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = reader.result as string;
            // Use Base64 if file is under 800KB, otherwise fall back to ObjectURL
            const finalUrl = submissionFile.size < 800000 ? result : URL.createObjectURL(submissionFile);

            await addDoc(collection(db, 'student_submissions'), {
              studentUsername: user.username,
              studentName: user.realName || user.username,
              className: `${user.grade}${user.section}`,
              subject: assignSubject,
              teacher: assignTeacher,
              fileName: submissionFile.name,
              fileUrl: finalUrl,
              createdAt: serverTimestamp()
            });

            setSubmissionFile(null);
            setAssignSubject('');
            setAssignTeacher('');
            setUploadSubmissionProgress(0);
            setIsSent(true);
            setSuccessToast('Даалгавар амжилттай илгээгдлээ!');
          } catch (err) {
            console.error("Local fallback upload db save error:", err);
            alert('Даалгавар илгээхэд алдаа гарлаа: ' + err);
          } finally {
            setIsUploadingSubmission(false);
          }
        };
        reader.readAsDataURL(submissionFile);
      } catch (e) {
        console.error("Local fallback upload read error:", e);
        alert('Даалгавар илгээхэд алдаа гарлаа');
        setIsUploadingSubmission(false);
      }
    };

    try {
      const formData = new FormData();
      formData.append('file', submissionFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://tmpfiles.org/api/v1/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadSubmissionProgress(percent);
        }
      };

      xhr.onload = async () => {
        try {
          if (xhr.status === 200) {
            const resp = JSON.parse(xhr.responseText);
            if (resp.status === 'success' && resp.data && resp.data.url) {
              const originalUrl = resp.data.url;
              const directUrl = originalUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

              await addDoc(collection(db, 'student_submissions'), {
                studentUsername: user.username,
                studentName: user.realName || user.username,
                className: `${user.grade}${user.section}`,
                subject: assignSubject,
                teacher: assignTeacher,
                fileName: submissionFile.name,
                fileUrl: directUrl,
                createdAt: serverTimestamp()
              });

              setSubmissionFile(null);
              setAssignSubject('');
              setAssignTeacher('');
              setUploadSubmissionProgress(0);
              setIsSent(true);
              setSuccessToast('Даалгавар амжилттай илгээгдлээ!');
            } else {
              console.warn("Upload service returned non-success structure, using local fallback");
              await fallbackLocalUpload();
            }
          } else {
            console.warn("Upload service HTTP status non-200, using local fallback");
            await fallbackLocalUpload();
          }
        } catch (err) {
          console.error("Upload handler error, using local fallback:", err);
          await fallbackLocalUpload();
        } finally {
          setIsUploadingSubmission(false);
        }
      };

      xhr.onerror = async () => {
        console.warn("Upload service network error, using local fallback");
        await fallbackLocalUpload();
      };

      xhr.send(formData);
    } catch (error) {
      console.error("Initiating file upload failed, using local fallback:", error);
      await fallbackLocalUpload();
    }
  };

  const renderHome = () => (
    <div className="[perspective:1200px] space-y-8 select-none overflow-hidden">
      {/* 3D Holographic Profile Banner */}
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
      >
        <ThreeDCard
          className="rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-650 text-white"
          glowColor="rgba(13, 148, 136, 0.45)"
          intensity={1.1}
        >
          <div className="relative overflow-hidden p-8">
            {/* Abstract 3D floating orb mock overlays */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -right-12 -bottom-12 w-40 h-40 rounded-full bg-teal-450/20 blur-xl animate-pulse pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 bg-gradient-to-tr from-white to-teal-50 text-teal-700 rounded-2xl flex items-center justify-center font-bold text-3xl shadow-[0_10px_25px_rgba(0,0,0,0.15),_inset_0_-4px_8px_rgba(0,0,0,0.1)] border border-white">
                    {(user.realName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-emerald-450 w-5 h-5 rounded-full border-4 border-teal-500 animate-ping" />
                  <div className="absolute -bottom-1 -right-1 bg-emerald-450 w-5 h-5 rounded-full border-4 border-teal-500" />
                </div>
                
                <div className="text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="text-[9px] bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-lg font-bold tracking-wider uppercase border border-white/10">СУРАГЧИЙН КАБИНЕТ</span>
                    {user.hasGoldBadge && (
                      <span className="inline-flex items-center gap-1 text-[9px] bg-amber-400 text-slate-900 font-extrabold px-2.5 py-1 rounded-lg shadow-[0_4px_12px_rgba(245,158,11,0.4)] border border-amber-300 animate-bounce">
                        <Award size={12} className="fill-amber-300" />
                        АЛТАН БАДЖ
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-black mt-2 tracking-tight drop-shadow-sm flex items-center justify-center sm:justify-start gap-2">
                    {user.realName || user.username}
                    {user.hasGoldBadge && <span className="text-xl animate-pulse">🏆</span>}
                  </h2>
                  <p className="text-teal-100 font-semibold mt-1 text-sm">{user.grade}-р ангийн {user.section} бүлэг</p>
                </div>
              </div>
              
              {/* Dashboard Quick Stats */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 text-center px-6 shadow-sm min-w-[124px] transition-transform duration-300 hover:scale-105">
                  <span className="block text-teal-100 text-[10px] font-bold uppercase tracking-wider">Суралцах</span>
                  <span className="text-2xl font-black font-mono tracking-tight mt-1 block">ИДЕВХТЭЙ</span>
                </div>
                {user.hasGoldBadge ? (
                  <div className="bg-amber-400/25 backdrop-blur-sm p-4 rounded-2xl border border-amber-400/30 text-center px-6 shadow-sm min-w-[124px] transition-transform duration-300 hover:scale-105">
                    <span className="block text-amber-200 text-[10px] font-bold uppercase tracking-wider">Амжилт</span>
                    <span className="text-2xl font-black font-mono text-amber-300 tracking-tight mt-1 block flex items-center justify-center gap-1">90%+ <Star size={16} className="fill-amber-350 text-amber-205" /></span>
                  </div>
                ) : (
                  <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10 text-center px-6 shadow-sm min-w-[124px] transition-transform duration-300 hover:scale-105">
                    <span className="block text-teal-100/60 text-[10px] font-bold uppercase tracking-wider">Авсан Цол</span>
                    <span className="text-xs font-bold text-teal-100/80 mt-2 block">Шалгалтанд 90+</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ThreeDCard>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-hidden">
        {/* Rights Card with physical 3D shadows and lift - Slides in from left */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.15 }}
        >
          <ThreeDCard
            className="bg-white rounded-3xl"
            glowColor="rgba(16, 185, 129, 0.18)"
            intensity={0.9}
          >
            <div className="relative p-7 h-full">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-[100px] pointer-events-none" />
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-[0_8px_16px_rgba(16,185,129,0.15)] flex items-center justify-center">
                  <Star size={24} className="fill-emerald-200" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Сурагчийн Эрх</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Таны сургууль дахь боломжууд</p>
                </div>
              </div>
              
              <ul className="space-y-3.5 text-slate-650 relative z-10">
                {[
                  "Чанартай боловсрол эзэмших, хүссэн хичээлүүдээ сонгон суралцах",
                  "Багш дасгалжуулагчдаас зөвлөгөө, тусламж авах, асуултаа асуух",
                  "Сургууль, анги хамт олны үйл ажиллагаанд идэвхтэй оролцох",
                  "Өөрийн үзэл бодлыг чөлөөтэй илэрхийлэх, харилцан ярилцах"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-2.5 bg-slate-50/55 rounded-xl border border-slate-50 hover:bg-emerald-50/40 hover:border-emerald-100 transition-all duration-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black flex items-center justify-center mt-0.5">{idx + 1}</span>
                    <span className="text-sm font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ThreeDCard>
        </motion.div>

        {/* Duties Card with physical 3D shadows and lift - Slides in from right */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.3 }}
        >
          <ThreeDCard
            className="bg-white rounded-3xl"
            glowColor="rgba(245, 158, 11, 0.18)"
            intensity={0.9}
          >
            <div className="relative p-7 h-full">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-[100px] pointer-events-none" />
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl shadow-[0_8px_16px_rgba(245,158,11,0.15)] flex items-center justify-center">
                  <Award size={24} className="fill-amber-200" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Хүлээх Үүрэг</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Сурагчийн баримтлах дотоод соёл</p>
                </div>
              </div>
              
              <ul className="space-y-3.5 text-slate-650 relative z-10">
                {[
                  "Хичээл уншлагандаа идэвхтэй оролцож, даалгавраа цагт нь гүйцэтгэх",
                  "Сургуулийн дотоод сахилга бат, сургалтын журмыг тууштай дагах",
                  "Бусад сурагч болон багш нарыг хүндэтгэх, боловсон харилцах",
                  "Сургуулийн дэд бүтэц, хамтран ажиллах эд хөрөнгөнд сэтгэлтэй хандах"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-2.5 bg-slate-50/55 rounded-xl border border-slate-50 hover:bg-amber-50/40 hover:border-amber-100 transition-all duration-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-750 text-xs font-black flex items-center justify-center mt-0.5">{idx + 1}</span>
                    <span className="text-sm font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ThreeDCard>
        </motion.div>
      </div>
    </div>
  );

  const renderLessons = () => {
    if (!selectedSubject) {
      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-800 mb-6">Ямар хичээлийн багш вэ?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {subjects.map(sub => (
              <button 
                key={sub}
                onClick={() => setSelectedSubject(sub)}
                className="p-6 border-2 border-slate-100 rounded-2xl hover:border-teal-500 hover:bg-teal-50 transition-all text-left font-bold text-slate-700 flex justify-between items-center group"
              >
                {sub}
                <ChevronRight className="text-slate-300 group-hover:text-teal-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (!selectedTeacher) {
      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6 text-slate-500 font-medium">
            <button onClick={() => setSelectedSubject('')} className="hover:text-teal-600">Хичээлүүд</button>
            <ChevronRight size={16} />
            <span className="text-slate-800 font-bold">{selectedSubject}</span>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-6">Багшаа сонгоно уу</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentLessonTeachers.map(teacher => (
              <button 
                key={teacher.username}
                onClick={() => setSelectedTeacher(teacher.username)}
                className="p-6 border-2 border-slate-100 rounded-2xl hover:border-teal-500 hover:bg-teal-50 transition-all text-left font-bold text-slate-700 flex items-center gap-4"
              >
                <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                  {teacher.realName.charAt(0)}
                </div>
                {teacher.realName}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-6 text-slate-500 font-medium">
          <button onClick={() => { setSelectedSubject(''); setSelectedTeacher(''); setIsPlaying(false); }} className="hover:text-teal-600">Хичээлүүд</button>
          <ChevronRight size={16} />
          <button onClick={() => { setSelectedTeacher(''); setIsPlaying(false); }} className="hover:text-teal-600">{selectedSubject}</button>
          <ChevronRight size={16} />
          <span className="text-slate-800 font-bold">{getTeacherRealName(selectedTeacher)}</span>
        </div>
        
        {isPlaying ? (
          <div>
            {currentLesson?.lessonType === 'slide' ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 mb-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mb-4">
                  <Presentation size={40} />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">{currentLessonTitle || 'Хичээлийн Слайд'}</h4>
                <p className="text-slate-500 mb-6 text-sm">Файлын нэр: {currentLesson?.originalFileName || 'slide.pptx'}</p>
                <a 
                  href={currentVideoUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <Download size={20} />
                  Слайд татаж авах
                </a>
              </div>
            ) : (
              <div className="bg-black rounded-2xl aspect-video mb-6 overflow-hidden shadow-lg">
                <video 
                  className="w-full h-full" 
                  controls 
                  autoPlay 
                  src={currentVideoUrl}
                >
                  Таны хөтөч видео тоглуулах боломжгүй байна.
                </video>
              </div>
            )}
            <h3 className="text-2xl font-bold text-slate-800 mb-2">
              {selectedSubject} - {currentLessonTitle || (currentLesson?.lessonType === 'slide' ? 'Илтгэл/Слайд' : 'Видео хичээл')}
            </h3>
            <p className="text-slate-500">Нийтэлсэн: {getTeacherRealName(selectedTeacher)}</p>
            <button 
              onClick={() => { setIsPlaying(false); setCurrentLesson(null); }}
              className="mt-6 px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Буцах
            </button>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-6">Нийтлэгдсэн хичээлүүд</h3>
            {isLoadingLessons ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin"></div>
              </div>
            ) : lessons.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {lessons.map(lesson => (
                  <div 
                    key={lesson.id}
                    className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-teal-500 cursor-pointer group transition-all"
                    onClick={() => {
                      setCurrentVideoUrl(lesson.videoUrl);
                      setCurrentLessonTitle(lesson.title);
                      setCurrentLesson(lesson);
                      setIsPlaying(true);
                    }}
                  >
                    <div className={`rounded-xl aspect-video flex items-center justify-center mb-4 relative overflow-hidden ${lesson.lessonType === 'slide' ? 'bg-gradient-to-br from-teal-500 to-emerald-600' : 'bg-slate-900'}`}>
                      {lesson.lessonType !== 'slide' && <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />}
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center shadow-lg z-10 group-hover:scale-110 transition-transform">
                        {lesson.lessonType === 'slide' ? (
                          <Presentation size={24} />
                        ) : (
                          <PlayCircle size={24} className="pl-0.5" strokeWidth={2.5} />
                        )}
                      </div>
                    </div>
                    <h4 className="font-bold text-slate-800">{lesson.title || (lesson.lessonType === 'slide' ? 'Слайд хичээл' : 'Видео хичээл')}</h4>
                    <p className="text-sm text-slate-500 mt-1">
                      {lesson.createdAt ? new Date(lesson.createdAt.toMillis()).toLocaleDateString() : 'Одоо'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                Одоогоор энэ хичээл дээр нийтлэгдсэн бичлэг байхгүй байна.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAssignments = () => {
    if (isSent) {
      return (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 flex flex-col items-center text-center"
        >
          <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={48} className="text-teal-600" />
          </div>
          <h3 className="text-3xl font-bold text-slate-800 mb-4">Даалгавар амжилттай илгээгдлээ!</h3>
          <p className="text-slate-500 text-lg mb-8 max-w-md">
            Таны даалгавар багш руу амжилттай илгээгдлээ. Багш шалгасны дараа дүн тань харагдах болно.
          </p>
          <button 
            onClick={() => { setIsSent(false); setAssignmentView('menu'); }}
            className="px-8 py-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            Буцах
          </button>
        </motion.div>
      );
    }

    if (assignmentView === 'menu') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
            className="h-full"
          >
            <ThreeDCard
              className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(79, 70, 229, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => setAssignmentView('view')}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <BookOpen size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Ирсэн даалгавар харах</span>
              </button>
            </ThreeDCard>
          </motion.div>

          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.1 }}
            className="h-full"
          >
            <ThreeDCard
              className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(13, 148, 136, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => setAssignmentView('submit')}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <UploadCloud size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Даалгавар илгээх</span>
              </button>
            </ThreeDCard>
          </motion.div>

          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.2 }}
            className="h-full"
          >
            <ThreeDCard
              className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(192, 38, 211, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => setAssignmentView('view_sent')}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <CheckCircle2 size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Илгээсэн даалгавраа харах</span>
              </button>
            </ThreeDCard>
          </motion.div>
        </div>
      );
    }

    if (assignmentView === 'view') {
      if (!viewAssignSubject) {
        return (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Ямар хичээлийн даалгавар вэ?</h3>
              <button onClick={() => { setAssignmentView('menu'); setViewAssignSubject(''); setViewAssignTeacher(''); }} className="text-teal-600 hover:underline font-medium">Буцах</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {subjects.map(sub => (
                <button 
                  key={sub}
                  onClick={() => setViewAssignSubject(sub)}
                  className="p-6 border-2 border-slate-100 rounded-2xl hover:border-teal-500 hover:bg-teal-50 transition-all text-left font-bold text-slate-700 flex justify-between items-center group"
                >
                  {sub}
                  <ChevronRight className="text-slate-300 group-hover:text-teal-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        );
      }

      if (!viewAssignTeacher) {
        return (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <button onClick={() => setViewAssignSubject('')} className="hover:text-teal-600">Хичээлүүд</button>
                <ChevronRight size={16} />
                <span className="text-slate-800 font-bold">{viewAssignSubject}</span>
              </div>
              <button onClick={() => { setAssignmentView('menu'); setViewAssignSubject(''); setViewAssignTeacher(''); }} className="text-teal-600 hover:underline font-medium">Буцах</button>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-6">Багшаа сонгоно уу</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentViewAssignTeachers.map(teacher => (
                <button 
                  key={teacher.username}
                  onClick={() => setViewAssignTeacher(teacher.username)}
                  className="p-6 border-2 border-slate-100 rounded-2xl hover:border-teal-500 hover:bg-teal-50 transition-all text-left font-bold text-slate-700 flex items-center gap-4"
                >
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold text-xl">
                    {teacher.realName.charAt(0)}
                  </div>
                  {teacher.realName}
                </button>
              ))}
            </div>
          </div>
        );
      }

      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <button onClick={() => { setViewAssignSubject(''); setViewAssignTeacher(''); }} className="hover:text-teal-600">Хичээлүүд</button>
              <ChevronRight size={16} />
              <button onClick={() => setViewAssignTeacher('')} className="hover:text-teal-600">{viewAssignSubject}</button>
              <ChevronRight size={16} />
              <span className="text-slate-800 font-bold">{getTeacherRealName(viewAssignTeacher)}</span>
            </div>
            <button onClick={() => { setAssignmentView('menu'); setViewAssignSubject(''); setViewAssignTeacher(''); }} className="text-teal-600 hover:underline font-medium">Буцах</button>
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 mb-6">Ирсэн даалгавар</h3>
          
          {isLoadingAssignments ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : assignments.length > 0 ? (
            <div className="space-y-4">
              {assignments.map(assign => (
                <div key={assign.id} className="p-6 border border-slate-100 rounded-2xl hover:border-teal-500 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-lg text-slate-800">{assign.title}</h4>
                    <p className="text-slate-500 text-sm mt-1">{assign.subject} • Багш: {getTeacherRealName(assign.teacher)}</p>
                    <p className="text-slate-400 text-xs mt-1">Нийтэлсэн: {assign.createdAt ? new Date(assign.createdAt.toMillis()).toLocaleDateString() : 'Одоо'}</p>
                  </div>
                  <a 
                    href={assign.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-6 py-2 bg-teal-50 text-teal-700 font-bold rounded-xl hover:bg-teal-100 transition-colors text-center whitespace-nowrap"
                  >
                    Татаж авах / Үзэх
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
              Одоогоор ирсэн даалгавар байхгүй байна.
            </div>
          )}
        </div>
      );
    }

    if (assignmentView === 'view_sent') {
      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Илгээсэн даалгаврууд</h3>
            <button onClick={() => setAssignmentView('menu')} className="text-teal-600 hover:underline font-medium">Буцах</button>
          </div>
          
          {isLoadingSentSubmissions ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
          ) : sentSubmissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-sm">
                    <th className="pb-4 font-medium">Хичээл</th>
                    <th className="pb-4 font-medium">Багш</th>
                    <th className="pb-4 font-medium">Файл</th>
                    <th className="pb-4 font-medium">Огноо</th>
                    <th className="pb-4 font-medium">Дүн</th>
                    <th className="pb-4 font-medium">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {sentSubmissions.map((sub) => (
                    <React.Fragment key={sub.id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-4 font-medium text-slate-800">{sub.subject}</td>
                        <td className="py-4 text-slate-600">{getTeacherRealName(sub.teacher)}</td>
                        <td className="py-4 text-slate-600">{sub.fileName}</td>
                        <td className="py-4 text-slate-500">
                          {sub.createdAt ? new Date(sub.createdAt.toMillis()).toLocaleString() : 'Одоо'}
                        </td>
                        <td className="py-4 font-bold text-teal-600">
                          {sub.grade ? sub.grade : <span className="text-slate-400 font-normal">Шалгаагүй</span>}
                        </td>
                        <td className="py-4">
                          <a 
                            href={sub.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-teal-600 hover:underline font-medium"
                          >
                            Үзэх
                          </a>
                        </td>
                      </tr>
                      {sub.feedback && (
                        <tr className="bg-teal-50/50">
                          <td colSpan={6} className="py-3 px-4 text-slate-600 text-sm">
                            <span className="font-bold text-teal-700">Багшийн сэтгэгдэл:</span> {sub.feedback}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
              Одоогоор илгээсэн даалгавар байхгүй байна.
            </div>
          )}
        </div>
      );
    }

    if (isSent) {
      return (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-12 shadow-sm border border-emerald-100 flex flex-col items-center text-center"
        >
          <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h3 className="text-3xl font-bold text-emerald-600 mb-4">Амжилттай илгээгдлээ</h3>
          <p className="text-slate-500 mb-8">Таны даалгавар багш руу амжилттай илгээгдлээ. Багш шалгасны дараа дүн орох болно.</p>
          <button 
            onClick={() => {
              setIsSent(false);
              setSubmissionFile(null);
              setAssignSubject('');
              setAssignTeacher('');
              setAssignmentView('menu');
            }}
            className="px-8 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Буцах
          </button>
        </motion.div>
      );
    }

    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-bold text-slate-800">Даалгавар илгээх</h3>
          <button onClick={() => setAssignmentView('menu')} className="text-teal-600 hover:underline font-medium">Буцах</button>
        </div>
        
        <div className="space-y-6 max-w-2xl">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Хичээл сонгох</label>
            <select 
              value={assignSubject}
              onChange={(e) => setAssignSubject(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-medium"
            >
              <option value="">Сонгох...</option>
              {subjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Багш сонгох</label>
            <select 
              value={assignTeacher}
              onChange={(e) => setAssignTeacher(e.target.value)}
              disabled={!assignSubject}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-medium disabled:opacity-50"
            >
              <option value="">Сонгох...</option>
              {currentAssignTeachers.map(t => (
                <option key={t.username} value={t.username}>{t.realName}</option>
              ))}
            </select>
          </div>

          {assignSubject && assignTeacher && (
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-4">Даалгаврын файл байршуулах</label>
              
              {!submissionFile ? (
                <label className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-slate-500 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-600 transition-all group cursor-pointer">
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,video/*,.pdf,.doc,.docx" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setSubmissionFile(e.target.files[0]);
                      }
                    }} 
                  />
                  <UploadCloud size={48} className="mb-4 text-slate-400 group-hover:text-teal-500 transition-colors" />
                  <span className="font-bold text-lg text-center">Энд дарж файл оруулна уу</span>
                  <span className="text-sm mt-2 opacity-70 text-center">Компьютероос сонгох (Зураг, Бичлэг, PDF, DOCX)</span>
                </label>
              ) : (
                <div className="space-y-6">
                  <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-16 h-16 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600">
                      <CheckCircle2 size={32} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{submissionFile.name}</h4>
                      <p className="text-sm text-slate-500">Амжилттай сонгогдлоо</p>
                    </div>
                    <button 
                      onClick={() => setSubmissionFile(null)}
                      className="text-red-500 hover:underline text-sm font-medium px-4"
                    >
                      Устгах
                    </button>
                  </div>
                  
                  <button 
                    onClick={handleSubmitAssignment}
                    disabled={isUploadingSubmission}
                    className="w-full py-4 bg-gradient-to-r from-emerald-400 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {isUploadingSubmission ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Түр хүлээнэ үү... {Math.round(uploadSubmissionProgress)}%
                      </>
                    ) : 'Даалгавар илгээх'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGrades = () => {
    // Get teachers for selected subject
    const currentGradesTeachers = gradesSubject
      ? teachersList.filter(t => t.subject === gradesSubject).map(t => ({ username: t.username, realName: t.realName || t.username }))
      : [];

    return (
      <div className="space-y-6">
        {/* Dropdowns for selection */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Хичээл сонгох</label>
            <select
              value={gradesSubject}
              onChange={(e) => {
                setGradesSubject(e.target.value);
                setGradesTeacher('');
              }}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-bold text-slate-800 transition-all cursor-pointer"
            >
              <option value="">Хичээл сонгох...</option>
              {subjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Багш сонгох</label>
            <select
              value={gradesTeacher}
              onChange={(e) => setGradesTeacher(e.target.value)}
              disabled={!gradesSubject}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-bold text-slate-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Багш сонгох...</option>
              {currentGradesTeachers.map(t => (
                <option key={t.username} value={t.username}>{t.realName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Display based on selections/visibility */}
        {!gradesSubject || !gradesTeacher ? (
          <div className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <FileSpreadsheet className="text-slate-300 mb-6 w-20 h-20" />
            <h3 className="text-2xl font-black text-slate-700 mb-2">Миний үнэлгээ</h3>
            <p className="text-slate-400 max-w-md text-sm leading-relaxed">
              Өөрийн хувийн дүн, сургалтын явцаа харахын тулд дээрх цэснээс үзэх хичээл болон тухайн хичээлийн заадаг багшийг сонгон уу.
            </p>
          </div>
        ) : isLoadingGrades ? (
          <div className="bg-white rounded-3xl p-24 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <Loader2 className="animate-spin text-teal-600 mb-4" size={36} />
            <p className="text-slate-500 font-semibold text-sm">Таны үнэлгээний картыг ачаалах зуур түр хүлээнэ үү...</p>
          </div>
        ) : !gradesVisibility ? (
          <div className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6 border border-amber-100 shadow-inner">
              <Lock size={36} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">Дүнгийн харагдац хаалттай байна</h3>
            <p className="text-slate-500 max-w-lg text-sm leading-relaxed">
              Таны сонгосон багш (<strong className="text-slate-700">{(teachersList.find(t => t.username === gradesTeacher)?.realName) || gradesTeacher}</strong>) хүүхдүүдэд {gradesSubject} хичээлийн дүнгийн бүртгэлийг нээж харахыг хараахан зөвшөөрөөгүй байна. 
            </p>
            <p className="text-slate-400 text-xs mt-3 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
              Багш тохиргоог нээсэний дараа таны дүн энд бодит цаг хугацаанд шууд шинэчлэгдэн гарч ирнэ.
            </p>
          </div>
        ) : gradesColumns.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <FileSpreadsheet className="text-slate-200 mb-6 w-16 h-16" />
            <h3 className="text-xl font-bold text-slate-700 mb-1">Одоогоор сургалт үүсгэгдээгүй байна</h3>
            <p className="text-slate-400 text-sm max-w-md">
              Энэ хичээлийн хувьд багш одоогоор хүүхдүүдээс шалгах ямар нэгэн сэдэв, сургалт эсвэл даалгавар систем дээр үүсгээгүй байна.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Stats Bento Box */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stat 1: Completed count */}
              {(() => {
                let completedCount = 0;
                gradesColumns.forEach(col => {
                  const item = myGradesList.find(d => d.lessonId === col.id);
                  if (item && item.status === 'completed') completedCount++;
                });
                const rate = Math.round((completedCount / gradesColumns.length) * 100);

                return (
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-6 rounded-3xl border border-indigo-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                      <FileSpreadsheet size={24} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">Суралцсан явц</p>
                      <h4 className="text-xl font-black text-slate-800">{completedCount} / {gradesColumns.length} сэдэв</h4>
                      <p className="text-xs text-indigo-600 font-semibold">{rate}% амжилттай оролцсон</p>
                    </div>
                  </div>
                );
              })()}

              {/* Stat 2: Average Score */}
              {(() => {
                let sum = 0;
                let count = 0;
                myGradesList.forEach(g => {
                  if (g.score !== null && g.score !== undefined) {
                    sum += g.score;
                    count++;
                  }
                });
                const avg = count > 0 ? Math.round(sum / count) : null;

                return (
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-6 rounded-3xl border border-teal-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-teal-500 text-white rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                      <Award size={24} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-teal-500 uppercase tracking-wider">Дундаж дүн</p>
                      <h4 className="text-xl font-black text-slate-800">{avg !== null ? `${avg}%` : 'Шахагдаагүй'}</h4>
                      <p className="text-xs text-teal-600 font-semibold">нийт заагдсан сэдвийн дундаж</p>
                    </div>
                  </div>
                );
              })()}

              {/* Stat 3: Performance Badge */}
              {(() => {
                let sum = 0;
                let count = 0;
                myGradesList.forEach(g => {
                  if (g.score !== null && g.score !== undefined) {
                    sum += g.score;
                    count++;
                  }
                });
                const avg = count > 0 ? Math.round(sum / count) : 0;
                let verbal = "Одоогоор дүн ороогүй";
                if (count > 0) {
                  if (avg >= 90) verbal = "A - Онцлох амжилт";
                  else if (avg >= 80) verbal = "B - Сайн амжилт";
                  else if (avg >= 70) verbal = "C - Хангалттай";
                  else if (avg >= 60) verbal = "D - Дундаж дүн";
                  else verbal = "F - Илүү хичээгээрэй";
                }

                return (
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-6 rounded-3xl border border-amber-100 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-400 text-white rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                      <Star size={24} className="fill-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Ерөнхий үнэлгээ</p>
                      <h4 className="text-md font-black text-slate-800 truncate max-w-[190px]">{verbal}</h4>
                      <p className="text-xs text-amber-700 font-semibold">Багшийн үнэлгээний стандарт</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* List of Detailed Grades */}
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center gap-2">
                <FileSpreadsheet className="text-slate-500" size={20} />
                <h4 className="font-bold text-slate-800">Дүнгийн дэлгэрэнгүй хуудас</h4>
              </div>

              <div className="divide-y divide-slate-100">
                {gradesColumns.map((col, idx) => {
                  const gradeItem = myGradesList.find(d => d.lessonId === col.id);
                  const isCompleted = gradeItem && gradeItem.status === 'completed';
                  const score = gradeItem ? gradeItem.score : null;

                  return (
                    <div key={col.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-start gap-4">
                        <span className="text-slate-300 font-bold text-sm mt-0.5">{idx + 1}</span>
                        <div>
                          <h5 className="font-bold text-slate-800 hover:text-teal-600 transition-colors">{col.title}</h5>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                              col.type === 'lesson' ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}>
                              {col.type === 'lesson' ? 'Сургалтын видео хичээл' : 'Гэрийн даалгавар'}
                            </span>
                            {gradeItem?.updatedAt && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Calendar size={10} />
                                {new Date(gradeItem.updatedAt.seconds * 1000).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-center">
                        {/* Status Badge */}
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1 shadow-sm border ${
                          isCompleted
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}>
                          {isCompleted ? <Check size={12} className="stroke-[3]" /> : <X size={12} className="stroke-[3]" />}
                          {isCompleted ? 'Хийсэн ✓' : 'Хийгээгүй -'}
                        </span>

                        {/* Grading Percent Block */}
                        <div className="text-right min-w-[75px]">
                          {score !== null ? (
                            <div className="flex flex-col">
                              <span className="text-lg font-black text-blue-600">{score}%</span>
                              <span className="text-[9px] text-slate-400 font-bold font-sans uppercase">Үнэлгээ</span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-md font-semibold text-slate-400">-</span>
                              <span className="text-[8px] text-slate-300 font-bold uppercase font-sans">будаагүй</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderQuizzes = () => {
    if (quizzesView === 'attempt' && activeQuiz) {
      const currentQ = activeQuiz.questions[curQuizQuestionIdx];
      const hasAnswered = !!submittedAnswers[currentQ?.id];
      const answerStatus = submittedAnswers[currentQ?.id];

      return (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header Progress Area */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">{activeQuiz.subject} сорил</span>
              <h3 className="text-lg font-black text-slate-800">{activeQuiz.title}</h3>
            </div>
            
            <div className="text-right flex flex-col items-end">
              <span className="text-xs font-extrabold text-slate-400 block">Асуулт {curQuizQuestionIdx + 1} / {activeQuiz.questions.length}</span>
              <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-teal-600 h-full transition-all duration-300"
                  style={{ width: `${((curQuizQuestionIdx + 1) / activeQuiz.questions.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Core Question Card */}
          {feedbackState === 'finished' ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-100 shadow-xl text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold animate-bounce">
                <CheckCircle2 size={44} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800">Шалгалт дууслаа!</h3>
                <p className="text-slate-500 max-w-md mx-auto">
                  Та {activeQuiz.title} шалгалтыг амжилттай бөглөж дуусгалаа. Хариултыг багш руу илгээв.
                </p>
              </div>

              {/* Score summary */}
              <div className="py-4 px-6 bg-slate-50 max-w-sm rounded-2xl border border-slate-100 mx-auto">
                <div className="text-sm font-semibold text-slate-500">Зөв хариулсан:</div>
                <div className="text-4xl font-extrabold text-blue-600 mt-1">
                  {activeQuiz.questions.reduce((count: number, q: any) => {
                    const ans = submittedAnswers[q.id];
                    return count + (ans && ans.isCorrect ? 1 : 0);
                  }, 0)} / {activeQuiz.questions.length}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setQuizzesView('menu');
                  setActiveQuiz(null);
                  setCurQuizQuestionIdx(0);
                  setSubmittedAnswers({});
                  setFeedbackState('idle');
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                Жагсаалт руу буцах
              </button>
            </div>
          ) : (
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-md space-y-6">
              {/* Question View Type */}
              <div className="space-y-4">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Асуулт {curQuizQuestionIdx + 1}
                </div>
                
                {currentQ.type === 'text' ? (
                  <h4 className="text-xl font-extrabold text-slate-800 leading-relaxed">
                    {currentQ.questionText}
                  </h4>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500 italic">Зургийг ажиглан зөв хувилбарыг сонгоно уу.</p>
                    <div className="rounded-2xl border border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center p-4">
                      <img 
                        src={currentQ.questionText} 
                        alt="Question visual" 
                        className="max-h-80 object-contain rounded-xl shadow-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Options variation */}
              <div className="space-y-3">
                {currentQ.options.map((optionText: string, oIdx: number) => {
                  const letter = ['A', 'B', 'C', 'D'][oIdx];
                  let optionClass = 'border-slate-200 bg-white text-slate-700 hover:border-blue-300';
                  let showCheckMark = false;
                  let showWrongMark = false;

                  if (hasAnswered) {
                    if (oIdx === currentQ.correctAnswer) {
                      // Correct answer is always colored green
                      optionClass = 'border-emerald-500 bg-emerald-500 text-white shadow-md font-bold';
                      showCheckMark = true;
                    } else if (answerStatus && answerStatus.selected === oIdx) {
                      // Student selected wrong answer is colored red
                      optionClass = 'border-red-500 bg-red-500 text-white shadow-md font-bold';
                      showWrongMark = true;
                    } else {
                      // Unselected remaining ones are faded out
                      optionClass = 'border-slate-100 bg-slate-50 text-slate-400 opacity-60';
                    }
                  }

                  return (
                    <button
                      key={oIdx}
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => handleSelectQuizAnswerVal(oIdx)}
                      className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between font-semibold gap-3 ${optionClass} ${!hasAnswered ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-not-allowed'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border ${hasAnswered ? 'bg-white/20 border-transparent text-white' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {letter}
                        </span>
                        <span>{optionText}</span>
                      </div>

                      {showCheckMark && <Check size={18} className="text-white" />}
                      {showWrongMark && <X size={18} className="text-white" />}
                    </button>
                  );
                })}
              </div>

              {/* Interactive Feedbacks or Actions */}
              {hasAnswered && (
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {answerStatus?.isCorrect ? (
                      <span className="text-emerald-600 font-extrabold text-sm flex items-center gap-2">
                        <CheckCircle2 size={16} />
                        Зөв хариуллаа!
                      </span>
                    ) : (
                      <span className="text-red-500 font-extrabold text-sm flex items-center gap-2">
                        <X size={16} />
                        Буруу хариуллаа.
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextQuizQuestion}
                    className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold transition-all shadow flex items-center gap-1 cursor-pointer"
                  >
                    <span>{curQuizQuestionIdx < activeQuiz.questions.length - 1 ? 'Дараах' : 'Шалгалтыг дуусгах'}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    const maxPercent = quizSubmissions.length > 0
      ? Math.max(...quizSubmissions.map(sub => sub.totalQuestions > 0 ? Math.round((sub.score / sub.totalQuestions) * 100) : 0))
      : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
              <Award className="text-blue-600" />
              Миний сорилт, шалгалтууд
            </h3>
            <p className="text-xs text-slate-500 mt-1">Танд тавигдсан ангийн шалгалтуудыг өгөх, авсан дүнгээ хянах цонх.</p>
          </div>
        </div>

        {/* Badges Achievement System Card / Banner */}
        <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/20 p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Star size={16} className="text-amber-500 fill-amber-400" />
                Сорилтын амжилтын бадж, цолны систем 🏆
              </h4>
              <p className="text-[11px] text-slate-500 font-medium">Шалгалтандаа өндөр амжилт үзүүлэн өөрийн нэр дээр цол болон онцгой тэмдгүүд цуглуулаарай!</p>
            </div>
            {quizSubmissions.length > 0 && (
              <div className="shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-xl text-xs font-bold shadow-xs">
                  <span>Таны дээд амжилт:</span>
                  <span className="font-mono text-sm font-black text-indigo-600">{maxPercent}%</span>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Bronze Medal */}
            <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${maxPercent >= 70 ? 'bg-amber-500/5 border-amber-500/20 shadow-xs' : 'bg-slate-50/50 border-slate-100 opacity-80'}`}>
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${maxPercent >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                  <Award size={18} className={maxPercent >= 70 ? 'fill-amber-600 stroke-amber-700 animate-pulse' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-slate-800">70%+ Хүрэл Од</span>
                    {maxPercent >= 70 && <span className="text-[9px] bg-amber-500/20 text-amber-800 font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">Авсан</span>}
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Урагштай сурагч</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">70%-иас дээш амжилт үзүүлж Хүрлэн Нарны тэмдгийг амжилттай өөрийн болгоно.</p>
            </div>

            {/* Silver Medal */}
            <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${maxPercent >= 80 ? 'bg-slate-400/10 border-slate-400/30 shadow-xs' : 'bg-slate-50/50 border-slate-100 opacity-80'}`}>
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${maxPercent >= 80 ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'}`}>
                  <Award size={18} className={maxPercent >= 80 ? 'fill-slate-300 stroke-slate-500 animate-pulse' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-slate-800">80%+ Мөнгөн Бамбай</span>
                    {maxPercent >= 80 && <span className="text-[9px] bg-slate-400/30 text-slate-800 font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">Авсан</span>}
                  </div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Чадварлаг сурагч</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">80%-иас дээш амжилт үзүүлж Мөнгөн од, Бамбайн тусгай хамгаалалтын бадгийг авна.</p>
            </div>

            {/* Gold Medal */}
            <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${maxPercent >= 90 ? 'bg-yellow-500/10 border-yellow-500/20 shadow-xs ring-1 ring-yellow-400/20' : 'bg-slate-50/50 border-slate-100 opacity-80'}`}>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={maxPercent >= 90 ? { backgroundColor: '#fef3c7', color: '#b45309' } : { backgroundColor: '#f1f5f9', color: '#94a3b8' }}>
                  <Award size={18} className={maxPercent >= 90 ? 'fill-amber-400 stroke-amber-600 animate-pulse' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-slate-800">90%+ Алтан Бадж</span>
                    {maxPercent >= 90 && <span className="text-[9px] bg-yellow-500/30 text-yellow-900 font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-bounce">Идэвхтэй</span>}
                  </div>
                  <p className="text-[9px] text-amber-600 font-black uppercase tracking-wider mt-0.5">🏆 Манлайлагч</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">90%-иас дээш амжилт үзүүлж Алтан Бадгийг авснаар Нэрнийхээ хажууд байнга цомтой (🏆) харагдана.</p>
            </div>
          </div>
        </div>

        {isLoadingQuizzes ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 size={36} className="animate-spin text-blue-600" />
          </div>
        ) : quizzes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map(quiz => {
              const submission = quizSubmissions.find(sub => sub.quizId === quiz.id);
              const hasTaken = !!submission;

              return (
                <div 
                  key={quiz.id} 
                  className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 w-2 h-full bg-gradient-to-b ${hasTaken ? 'from-emerald-400 to-green-500' : 'from-blue-500 to-indigo-600'}`} />
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {quiz.subject}
                      </span>
                      {hasTaken ? (
                        <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          Дууссан
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          Шинэ сорил
                        </span>
                      )}
                    </div>
                    
                    <h4 className="text-lg font-bold text-slate-800 line-clamp-2">{quiz.title}</h4>
                    
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 font-medium">Багш: <span className="text-slate-600">{getTeacherRealName(quiz.teacher)}</span></p>
                      <p className="text-xs text-slate-400 font-medium">Асуултын тоо: <span className="text-slate-600">{quiz.questions?.length || 0}</span></p>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-50 flex justify-between items-center w-full">
                    {hasTaken ? (
                      <div className="flex justify-between items-center w-full">
                        <span className="text-xs font-semibold text-slate-500">Авсан оноо:</span>
                        <span className="text-sm font-extrabold text-emerald-600">
                          {submission.score} / {submission.totalQuestions} ({Math.round((submission.score / submission.totalQuestions) * 100)}%)
                        </span>
                      </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => {
                          setActiveQuiz(quiz);
                          setSubmittedAnswers({});
                          setCurQuizQuestionIdx(0);
                          setFeedbackState('idle');
                          setQuizzesView('attempt');
                        }}
                        className="w-full text-center py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        Сорилтыг эхлүүлэх
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-500 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3">
            <Award size={48} className="text-slate-300" />
            <span className="font-bold text-slate-700">Танд тавигдсан шалгалт байхгүй байна.</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg,#fafafa)] relative overflow-hidden">
      {/* Success Notification Alert */}
      {successToast && (
        <div className="fixed top-24 right-8 z-[100] bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 font-bold border border-emerald-400">
          <CheckCircle2 size={24} />
          <span>{successToast}</span>
        </div>
      )}
      {/* Modern Grid Pattern & Blobs for Dashboard */}
      <div className="absolute inset-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] z-0 pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[50rem] h-[50rem] bg-emerald-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-blob z-0 pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[45rem] h-[45rem] bg-teal-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000 z-0 pointer-events-none" />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <span className="text-lg sm:text-xl font-black text-slate-800 bg-gradient-to-r from-teal-650 to-emerald-650 bg-clip-text text-transparent">Ухаалаг Сургууль</span>
            <ProfileDropdown user={user} onUpdateUser={onUpdateUser} onLogout={onLogout} />
          </div>
          
          {/* Navigation */}
          <nav className="flex space-x-4 sm:space-x-8 border-t border-slate-100 overflow-x-auto scrollbar-none whitespace-nowrap">
            {[
              { id: 'home', label: 'Нүүр' },
              { id: 'lessons', label: 'Хичээл үзэх' },
              { id: 'assignments', label: 'Даалгавар' },
              { id: 'grades', label: 'Миний үнэлгээ' },
              { id: 'quizzes', label: 'Шалгалтууд' },
              { id: 'chat', label: 'Чат' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  // Reset states when switching tabs
                  if (tab.id === 'lessons') {
                    setSelectedSubject('');
                    setSelectedTeacher('');
                    setIsPlaying(false);
                  }
                  if (tab.id === 'assignments') {
                    setAssignmentView('menu');
                    setIsSent(false);
                    setSubmissionFile(null);
                  }
                  if (tab.id === 'grades') {
                    setGradesSubject('');
                    setGradesTeacher('');
                    setMyGradesList([]);
                    setGradesVisibility(false);
                  }
                }}
                className={`py-4 px-2 border-b-2 font-bold transition-colors flex-shrink-0 ${
                  activeTab === tab.id 
                    ? 'border-teal-600 text-teal-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'home' && renderHome()}
          {activeTab === 'lessons' && renderLessons()}
          {activeTab === 'assignments' && renderAssignments()}
          {activeTab === 'grades' && renderGrades()}
          {activeTab === 'quizzes' && renderQuizzes()}
          {activeTab === 'chat' && <ChatSystem user={user as any} />}
        </motion.div>
      </main>
    </div>
  );
}
