import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LogOut, FileText, Video, PlusCircle, CheckSquare, Users, UploadCloud, CheckCircle2, FileSpreadsheet, Eye, EyeOff, Save, Loader2, Award, Calendar, HelpCircle, Check, X, Star } from 'lucide-react';
import { UserData } from './LoginForm';
import { db, storage } from '../firebase';
import { collection, addDoc, setDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ProfileDropdown } from './ProfileDropdown';
import { ChatSystem } from './ChatSystem';
import { ThreeDCard } from './ThreeDCard';

type AttendanceStatus = 'present' | 'absent' | 'excused' | 'sick';
interface AttendanceRecord {
  id: string;
  date: string;
  className: string;
  data: Record<string, AttendanceStatus>;
}
const MOCK_STUDENTS = ['Б. Бат-Эрдэнэ', 'А. Алтансүх', 'Г. Төгөлдөр', 'Э. Наранбаяр', 'С. Болдбаатар'];

interface TeacherDashboardProps {
  user: UserData;
  onLogout: () => void;
  onUpdateUser: (user: UserData) => void;
}

// Generate all classes from 6 to 12 with their respective sections
const generateAllClasses = () => {
  const classes: string[] = [];
  for (let i = 6; i <= 12; i++) {
    let sections = [];
    if (i <= 6) sections = ['А', 'Б', 'В', 'Г'];
    else if (i <= 9) sections = ['А', 'Б', 'В'];
    else sections = ['А', 'Б'];
    
    sections.forEach(sec => classes.push(`${i}${sec}`));
  }
  return classes;
};

const allClasses = generateAllClasses();

export function TeacherDashboard({ user, onLogout, onUpdateUser }: TeacherDashboardProps) {
  let mySubject = user.subject || 'Хичээл';

  const [activeTab, setActiveTab] = useState<'home' | 'lessons' | 'assignments' | 'attendance' | 'grades' | 'quizzes' | 'chat'>('home');
  const [assignmentView, setAssignmentView] = useState<'menu' | 'add' | 'check' | 'view_sent'>('menu');
  const [attendanceView, setAttendanceView] = useState<'menu' | 'record' | 'view' | 'edit'>('menu');
  const [selectedClass, setSelectedClass] = useState('');
  const [lessonClass, setLessonClass] = useState('');

  // Quiz / Test States
  const [quizzesList, setQuizzesList] = useState<any[]>([]);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(false);
  const [quizzesView, setQuizzesView] = useState<'menu' | 'add' | 'submissions'>('menu');
  const [selectedQuiz, setSelectedQuiz] = useState<any | null>(null);
  const [quizStudentSubmissions, setQuizStudentSubmissions] = useState<any[]>([]);
  const [quizIdToDelete, setQuizIdToDelete] = useState<string | null>(null);

  // Create quiz form states
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newQuizSubject, setNewQuizSubject] = useState(user.subject || 'Математик');
  const [newQuizClass, setNewQuizClass] = useState('');
  const [newQuizQuestions, setNewQuizQuestions] = useState<any[]>([]);

  // Current question draft states
  const [curQuestionType, setCurQuestionType] = useState<'text' | 'image'>('text');
  const [curQuestionText, setCurQuestionText] = useState(''); // Text or Image base64 URL
  const [curQuestionOptions, setCurQuestionOptions] = useState<string[]>(['', '', '', '']);
  const [curCorrectAnswer, setCurCorrectAnswer] = useState<number>(0); // 0=A, 1=B, 2=C, 3=D

  // Gradebook Spreadsheet States
  const [gradebookClass, setGradebookClass] = useState('10А');
  const [gradebookSubject, setGradebookSubject] = useState(user.subject || 'Математик');
  const [gradebookColumns, setGradebookColumns] = useState<any[]>([]);
  const [gradebookStudents, setGradebookStudents] = useState<any[]>([]);
  const [gradebookGrades, setGradebookGrades] = useState<Record<string, { status: string, score: number | null }>>({});
  const [gradebookVisibility, setGradebookVisibility] = useState(false);
  const [isLoadingGradebook, setIsLoadingGradebook] = useState(false);
  const [isSavingCell, setIsSavingCell] = useState<Record<string, boolean>>({});
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  // Sent Assignments State
  const [sentAssignments, setSentAssignments] = useState<any[]>([]);
  const [isLoadingSentAssignments, setIsLoadingSentAssignments] = useState(false);

  // Student Submissions State
  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);

  // Video Upload States
  const [lessonView, setLessonView] = useState<'menu' | 'add' | 'view_published'>('menu');
  const [publishedLessons, setPublishedLessons] = useState<any[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonSubject, setLessonSubject] = useState('');
  const [lessonTargetClass, setLessonTargetClass] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Grading states
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  // Attendance states
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [currentAttendance, setCurrentAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSuccess, setAttendanceSuccess] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  const [currentClassStudents, setCurrentClassStudents] = useState<any[]>([]);
  const [isLoadingClassStudents, setIsLoadingClassStudents] = useState(false);
  const [allStudents, setAllStudents] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'attendance' || activeTab === 'grades') {
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'student')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const studs = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
        setAllStudents(studs);
      }, (error) => {
        console.error("Error fetching all students:", error);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const getStudentRealName = (key: string): string => {
    if (!key) return '';
    const cleanKey = key.trim().toLowerCase();
    const foundByUsername = allStudents.find(s => s.username && s.username.toLowerCase() === cleanKey);
    if (foundByUsername) {
      return foundByUsername.realName || foundByUsername.username;
    }
    const foundByRealName = allStudents.find(s => s.realName && s.realName.toLowerCase() === cleanKey);
    if (foundByRealName) {
      return foundByRealName.realName;
    }
    return key;
  };

  useEffect(() => {
    if (attendanceSuccess) {
      const timer = setTimeout(() => setAttendanceSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [attendanceSuccess]);

  useEffect(() => {
    if (selectedClass) {
      setIsLoadingClassStudents(true);
      const gradePart = selectedClass.replace(/[^0-9]/g, '');
      const sectionPart = selectedClass.replace(/[0-9]/g, '');
      
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'student')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const filtered = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any))
          .filter(u => u.grade === gradePart && u.section === sectionPart);
        
        setCurrentClassStudents(filtered);
        setIsLoadingClassStudents(false);
        
        if (attendanceView === 'edit' && editingRecordId) {
          const activeRecord = attendanceRecords.find(r => r.id === editingRecordId);
          if (activeRecord) {
            const normalizedAtt: Record<string, AttendanceStatus> = {};
            filtered.forEach(s => {
              normalizedAtt[s.username] = 'present';
            });
            Object.entries(activeRecord.data).forEach(([key, status]) => {
              const matchedStudent = filtered.find(s => s.username === key || s.realName === key || (s.realName || s.username) === key);
              const finalKey = matchedStudent ? matchedStudent.username : key;
              normalizedAtt[finalKey] = status as AttendanceStatus;
            });
            setCurrentAttendance(normalizedAtt);
          }
        } else {
          const initialAtt: Record<string, AttendanceStatus> = {};
          filtered.forEach(s => {
            initialAtt[s.username] = 'present';
          });
          setCurrentAttendance(initialAtt);
        }
      }, (error) => {
        console.error("Error fetching class students:", error);
        setIsLoadingClassStudents(false);
      });
      
      return () => unsubscribe();
    } else {
      setCurrentClassStudents([]);
      setCurrentAttendance({});
    }
  }, [selectedClass, attendanceView, editingRecordId, attendanceRecords]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      const q = query(collection(db, 'attendance'), where('teacher', '==', user.username));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAttendanceRecords(fetched);
      }, (error) => {
        console.error("Error fetching attendance:", error);
      });
      return () => unsubscribe();
    }
  }, [activeTab, user.username]);

  useEffect(() => {
    if (assignmentView === 'check') {
      setIsLoadingSubmissions(true);
      const q = query(collection(db, 'student_submissions'), where('teacher', '==', user.username));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        setStudentSubmissions(fetched);
        setIsLoadingSubmissions(false);
      }, (error) => {
        console.error("Error fetching student submissions:", error);
        setIsLoadingSubmissions(false);
      });
      return () => unsubscribe();
    }
  }, [assignmentView, user.username]);

  useEffect(() => {
    if (assignmentView === 'view_sent') {
      setIsLoadingSentAssignments(true);
      const q = query(collection(db, 'assignments'), where('teacher', '==', user.username));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        setSentAssignments(fetched);
        setIsLoadingSentAssignments(false);
      }, (error) => {
        console.error("Error fetching sent assignments:", error);
        setIsLoadingSentAssignments(false);
      });
      return () => unsubscribe();
    }
  }, [assignmentView, user.username]);

  useEffect(() => {
    if (lessonView === 'view_published') {
      setIsLoadingLessons(true);
      const q = query(collection(db, 'lessons'), where('teacher', '==', user.username));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        fetched.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        setPublishedLessons(fetched);
        setIsLoadingLessons(false);
      }, (error) => {
        console.error("Error fetching published lessons:", error);
        setIsLoadingLessons(false);
      });
      return () => unsubscribe();
    }
  }, [lessonView, user.username]);

  // --- Quizzes Data Syncing and Handlers ---
  useEffect(() => {
    if (activeTab === 'quizzes' && user.username) {
      setIsLoadingQuizzes(true);
      const q = query(
        collection(db, 'quizzes'),
        where('teacher', '==', user.username)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
        list.sort((a, b) => {
          const tA = (a.createdAt?.seconds || 0) * 1000 + (a.createdAt?.nanoseconds || 0) / 1000000;
          const tB = (b.createdAt?.seconds || 0) * 1000 + (b.createdAt?.nanoseconds || 0) / 1000000;
          return tB - tA;
        });
        setQuizzesList(list);
        setIsLoadingQuizzes(false);
      }, (error) => {
        console.error("Quizzes fetch error:", error);
        setIsLoadingQuizzes(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab, user.username]);

  useEffect(() => {
    if (activeTab === 'quizzes' && selectedQuiz && quizzesView === 'submissions') {
      const q = query(
        collection(db, 'quiz_submissions'),
        where('quizId', '==', selectedQuiz.id)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setQuizStudentSubmissions(list);
      }, (error) => {
        console.error("Quiz submissions fetch error:", error);
      });
      return () => unsubscribe();
    }
  }, [activeTab, selectedQuiz, quizzesView]);

  const handleDeleteQuiz = async (quizId: string) => {
    try {
      await deleteDoc(doc(db, 'quizzes', quizId));
      // Also delete any submissions of this quiz to keep Firestore tidy
      const qSub = query(collection(db, 'quiz_submissions'), where('quizId', '==', quizId));
      const snapshots = await getDocs(qSub);
      for (const snapDoc of snapshots.docs) {
        await deleteDoc(doc(db, 'quiz_submissions', snapDoc.id));
      }
      setSuccessToast('Шалгалтыг амжилттай устгалаа!');
    } catch (err) {
      console.error("Error deleting quiz:", err);
      setErrorToast('Шалгалт устгахад алдаа гарлаа: ' + err);
    }
  };

  const handlePublishQuiz = async () => {
    if (!newQuizTitle.trim()) {
      alert('Шалгалтын гарчиг оруулна уу!');
      return;
    }
    if (!newQuizSubject) {
      alert('Шалгалтын хичээлийг сонгоно уу!');
      return;
    }
    if (!newQuizClass) {
      alert('Шалгалтын зорилтот ангийг сонгоно уу!');
      return;
    }
    if (newQuizQuestions.length === 0) {
      alert('Шалгалтанд дор хаяж 1 асуулт нэмнэ үү!');
      return;
    }

    try {
      await addDoc(collection(db, 'quizzes'), {
        title: newQuizTitle,
        subject: newQuizSubject,
        className: newQuizClass,
        teacher: user.username,
        questions: newQuizQuestions,
        createdAt: serverTimestamp()
      });

      // Reset form
      setNewQuizTitle('');
      setNewQuizSubject(user.subject || 'Математик');
      setNewQuizClass('');
      setNewQuizQuestions([]);
      setQuizzesView('menu');
      alert('Шалгалт амжилттай нийтлэгдлээ!');
    } catch (err) {
      console.error("Error publishing quiz:", err);
      alert('Шалгалт нийтлэхэд алдаа гарлаа: ' + err);
    }
  };

  const handleAddQuestionToDraft = () => {
    if (curQuestionType === 'text' && !curQuestionText.trim()) {
      alert('Асуултын бичвэрийг оруулна уу!');
      return;
    }
    if (curQuestionType === 'image' && !curQuestionText) {
      alert('Асуултын зургийг сонгоно уу!');
      return;
    }
    if (curQuestionOptions.some(opt => !opt.trim())) {
      alert('А, Б, В, Г бүх хувилбаруудыг бөглөнө үү!');
      return;
    }

    const newQObj = {
      id: Date.now().toString(),
      type: curQuestionType,
      questionText: curQuestionText,
      options: [...curQuestionOptions],
      correctAnswer: curCorrectAnswer
    };

    setNewQuizQuestions([...newQuizQuestions, newQObj]);
    setCurQuestionText('');
    setCurQuestionOptions(['', '', '', '']);
    setCurCorrectAnswer(0);
  };

  const handleQuizQuestionImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      alert('Зургийн хэмжээ 800KB-аас бага байх ёстой!');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCurQuestionText(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // --- Gradebook (Excel Spreadsheet) Data Syncing ---
  useEffect(() => {
    if (activeTab === 'grades') {
      setIsLoadingGradebook(true);
      
      const qLessons = query(
        collection(db, 'lessons'), 
        where('teacher', '==', user.username),
        where('className', '==', gradebookClass),
        where('subject', '==', gradebookSubject)
      );

      const qAssignments = query(
        collection(db, 'assignments'),
        where('teacher', '==', user.username),
        where('className', '==', gradebookClass),
        where('subject', '==', gradebookSubject)
      );

      const qGrades = query(
        collection(db, 'grades'),
        where('className', '==', gradebookClass),
        where('subject', '==', gradebookSubject),
        where('teacher', '==', user.username)
      );

      const qStudents = query(
        collection(db, 'users'),
        where('role', '==', 'student')
      );

      const docId = `${gradebookClass}_${gradebookSubject}_${user.username}`;
      const unsubscribeVisibility = onSnapshot(doc(db, 'grade_visibility', docId), (docSnap) => {
        if (docSnap.exists()) {
          setGradebookVisibility(docSnap.data().published || false);
        } else {
          setGradebookVisibility(false);
        }
      });

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

          const combinedCols = [...fetchedLessons, ...fetchedAssigns];
          combinedCols.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeA - timeB;
          });

          setGradebookColumns(combinedCols);
        });
      };

      const unsubscribeGrades = onSnapshot(qGrades, (gradesSnap) => {
        const gradesMap: Record<string, { status: string, score: number | null }> = {};
        gradesSnap.docs.forEach(docSnap => {
          const d = docSnap.data();
          gradesMap[`${d.studentUsername}_${d.lessonId}`] = {
            status: d.status || 'not_completed',
            score: d.score !== undefined ? d.score : null
          };
        });
        setGradebookGrades(gradesMap);
      });

      const unsubscribeStudents = onSnapshot(qStudents, (studentsSnap) => {
        const gradePart = gradebookClass.replace(/[^0-9]/g, '');
        const sectionPart = gradebookClass.replace(/[0-9]/g, '');
        
        const registered = studentsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(u => u.grade === gradePart && u.section === sectionPart);
        
        if (registered.length > 0) {
          setGradebookStudents(registered.map(r => ({
            username: r.username,
            realName: r.realName || r.username
          })));
        } else {
          setGradebookStudents([]);
        }
        setIsLoadingGradebook(false);
      });

      return () => {
        unsubscribeVisibility();
        unsubscribeLessons();
        if (unsubscribeAssignments) unsubscribeAssignments();
        unsubscribeGrades();
        unsubscribeStudents();
      };
    }
  }, [activeTab, gradebookClass, gradebookSubject, user.username]);

  const handleCellUpdate = async (student: any, lesson: any, field: 'status' | 'score', value: any) => {
    const cellKey = `${student.username}_${lesson.id}`;
    setIsSavingCell(prev => ({ ...prev, [cellKey]: true }));
    
    const currentGrade = gradebookGrades[cellKey] || { status: 'not_completed', score: null };
    
    // Auto complete status if score is being set and is positive
    let finalStatus = currentGrade.status;
    if (field === 'score' && value !== null && value !== '') {
      finalStatus = 'completed';
    } else if (field === 'status') {
      finalStatus = value;
    }

    const updatedGrade = {
      studentUsername: student.username,
      studentName: student.realName,
      className: gradebookClass,
      subject: gradebookSubject,
      teacher: user.username,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      status: finalStatus,
      score: field === 'score' ? (value === '' ? null : Number(value)) : currentGrade.score,
      updatedAt: serverTimestamp()
    };

    try {
      const docId = `${student.username}_${lesson.id}`;
      await setDoc(doc(db, 'grades', docId), updatedGrade);
      
      setGradebookGrades(prev => ({
        ...prev,
        [cellKey]: { status: updatedGrade.status, score: updatedGrade.score }
      }));
    } catch (error) {
      console.error("Error saving grade cell:", error);
    } finally {
      setIsSavingCell(prev => ({ ...prev, [cellKey]: false }));
    }
  };

  const handleToggleVisibility = async () => {
    const docId = `${gradebookClass}_${gradebookSubject}_${user.username}`;
    const nextVal = !gradebookVisibility;
    try {
      await setDoc(doc(db, 'grade_visibility', docId), {
        className: gradebookClass,
        subject: gradebookSubject,
        teacher: user.username,
        published: nextVal,
        updatedAt: serverTimestamp()
      });
      setGradebookVisibility(nextVal);
      setSuccessToast(nextVal ? 'Үнэлгээ сурагчдад амжилттай харагддаг боллоо!' : 'Үнэлгээг сурагчдаас нуулаа.');
    } catch (error) {
      console.error("Error setting grade visibility:", error);
      alert("Тохиргоо хамгаалахад алдаа гарлаа!");
    }
  };

  // File upload states for visual feedback
  const [slideFile, setSlideFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [isAssignmentSent, setIsAssignmentSent] = useState(false);
  const [isLessonSent, setIsLessonSent] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const [errorToast, setErrorToast] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [isUploadingAssignment, setIsUploadingAssignment] = useState(false);
  const [uploadAssignmentProgress, setUploadAssignmentProgress] = useState(0);

  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'slide' | 'video' | 'assignment') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (type === 'slide') setSlideFile(file);
      if (type === 'video') setVideoFile(file);
      if (type === 'assignment') setAssignmentFile(file);
    }
  };

  const handlePublishAssignment = async () => {
    if (!assignmentFile || !selectedClass || !assignmentTitle) {
      alert('Мэдээллийг бүрэн бөглөнө үү!');
      return;
    }
    setIsUploadingAssignment(true);
    setUploadAssignmentProgress(0);

    const fallbackLocalUpload = async () => {
      try {
        setUploadAssignmentProgress(100);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = reader.result as string;
            // Use Base64 if file is under 800KB, otherwise fall back to ObjectURL
            const finalUrl = assignmentFile.size < 800000 ? result : URL.createObjectURL(assignmentFile);

            await addDoc(collection(db, 'assignments'), {
              teacher: user.username,
              subject: mySubject,
              className: selectedClass,
              title: assignmentTitle,
              fileName: assignmentFile.name,
              fileUrl: finalUrl,
              createdAt: serverTimestamp()
            });

            setAssignmentFile(null);
            setAssignmentTitle('');
            setSelectedClass('');
            setUploadAssignmentProgress(0);
            setIsAssignmentSent(true);
            setSuccessToast('Даалгавар амжилттай нийтлэгдлээ!');
          } catch (err) {
            console.error("Local fallback upload db save error:", err);
            alert('Даалгавар нийтлэхэд алдаа гарлаа: ' + err);
          } finally {
            setIsUploadingAssignment(false);
          }
        };
        reader.readAsDataURL(assignmentFile);
      } catch (e) {
        console.error("Local fallback upload read error:", e);
        alert('Даалгавар нийтлэхэд алдаа гарлаа');
        setIsUploadingAssignment(false);
      }
    };

    try {
      const formData = new FormData();
      formData.append('file', assignmentFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://tmpfiles.org/api/v1/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadAssignmentProgress(percent);
        }
      };

      xhr.onload = async () => {
        try {
          if (xhr.status === 200) {
            const resp = JSON.parse(xhr.responseText);
            if (resp.status === 'success' && resp.data && resp.data.url) {
              const originalUrl = resp.data.url;
              const directUrl = originalUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

              await addDoc(collection(db, 'assignments'), {
                teacher: user.username,
                subject: mySubject,
                className: selectedClass,
                title: assignmentTitle,
                fileName: assignmentFile.name,
                fileUrl: directUrl,
                createdAt: serverTimestamp()
              });

              setAssignmentFile(null);
              setAssignmentTitle('');
              setSelectedClass('');
              setUploadAssignmentProgress(0);
              setIsAssignmentSent(true);
              setSuccessToast('Даалгавар амжилттай нийтлэгдлээ!');
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
          setIsUploadingAssignment(false);
        }
      };

      xhr.onerror = async () => {
        console.warn("Upload service network error, using local fallback");
        await fallbackLocalUpload();
      };

      xhr.send(formData);
    } catch (error) {
      console.error("Initiating assignment upload failed, using local fallback:", error);
      await fallbackLocalUpload();
    }
  };

  const handlePublishSlide = async () => {
    if (!slideFile || !lessonTitle || !lessonSubject || !lessonTargetClass) {
      alert('Мэдээллийг бүрэн бөглөнө үү!');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);

    const fallbackLocalUpload = async () => {
      try {
        setUploadProgress(100);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = reader.result as string;
            const finalUrl = slideFile.size < 800000 ? result : URL.createObjectURL(slideFile);

            await addDoc(collection(db, 'lessons'), {
              teacher: user.username,
              subject: lessonSubject,
              className: lessonTargetClass,
              title: lessonTitle,
              videoUrl: finalUrl,
              lessonType: 'slide',
              originalFileName: slideFile.name,
              createdAt: serverTimestamp()
            });

            setSlideFile(null);
            setLessonTitle('');
            setLessonSubject('');
            setLessonTargetClass('');
            setUploadProgress(0);
            setIsLessonSent(true);
            setSuccessToast('Илтгэл/Слайд амжилттай нийтлэгдлээ!');
          } catch (err) {
            console.error("Local fallback slide upload db save error:", err);
            alert('Слайд нийтлэхэд алдаа гарлаа: ' + err);
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(slideFile);
      } catch (e) {
        console.error("Local fallback slide upload read error:", e);
        alert('Слайд нийтлэхэд алдаа гарлаа');
        setIsUploading(false);
      }
    };

    try {
      const formData = new FormData();
      formData.append('file', slideFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://tmpfiles.org/api/v1/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = async () => {
        try {
          if (xhr.status === 200) {
            const resp = JSON.parse(xhr.responseText);
            if (resp.status === 'success' && resp.data && resp.data.url) {
              const originalUrl = resp.data.url;
              const directUrl = originalUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

              await addDoc(collection(db, 'lessons'), {
                teacher: user.username,
                subject: lessonSubject,
                className: lessonTargetClass,
                title: lessonTitle,
                videoUrl: directUrl,
                lessonType: 'slide',
                originalFileName: slideFile.name,
                createdAt: serverTimestamp()
              });

              setSlideFile(null);
              setLessonTitle('');
              setLessonSubject('');
              setLessonTargetClass('');
              setUploadProgress(0);
              setIsLessonSent(true);
              setSuccessToast('Илтгэл/Слайд амжилттай нийтлэгдлээ!');
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
          setIsUploading(false);
        }
      };

      xhr.onerror = async () => {
        console.warn("Upload service network error, using local fallback");
        await fallbackLocalUpload();
      };

      xhr.send(formData);
    } catch (error) {
      console.error("Initiating slide upload failed, using local fallback:", error);
      await fallbackLocalUpload();
    }
  };

  const handlePublishVideo = async () => {
    if (!videoFile || !lessonTitle || !lessonSubject || !lessonTargetClass) {
      alert('Мэдээллийг бүрэн бөглөнө үү!');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);

    const fallbackLocalUpload = async () => {
      try {
        setUploadProgress(100);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = reader.result as string;
            const finalUrl = videoFile.size < 800000 ? result : URL.createObjectURL(videoFile);

            await addDoc(collection(db, 'lessons'), {
              teacher: user.username,
              subject: lessonSubject,
              className: lessonTargetClass,
              title: lessonTitle,
              videoUrl: finalUrl,
              lessonType: 'video',
              originalFileName: videoFile.name,
              createdAt: serverTimestamp()
            });

            setVideoFile(null);
            setLessonTitle('');
            setLessonSubject('');
            setLessonTargetClass('');
            setUploadProgress(0);
            setIsLessonSent(true);
            setSuccessToast('Хичээл амжилттай нийтлэгдлээ!');
          } catch (err) {
            console.error("Local fallback video upload db save error:", err);
            alert('Хичээл нийтлэхэд алдаа гарлаа: ' + err);
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(videoFile);
      } catch (e) {
        console.error("Local fallback video upload read error:", e);
        alert('Хичээл нийтлэхэд алдаа гарлаа');
        setIsUploading(false);
      }
    };

    try {
      const formData = new FormData();
      formData.append('file', videoFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://tmpfiles.org/api/v1/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = async () => {
        try {
          if (xhr.status === 200) {
            const resp = JSON.parse(xhr.responseText);
            if (resp.status === 'success' && resp.data && resp.data.url) {
              const originalUrl = resp.data.url;
              const directUrl = originalUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');

              await addDoc(collection(db, 'lessons'), {
                teacher: user.username,
                subject: lessonSubject,
                className: lessonTargetClass,
                title: lessonTitle,
                videoUrl: directUrl,
                lessonType: 'video',
                originalFileName: videoFile.name,
                createdAt: serverTimestamp()
              });

              setVideoFile(null);
              setLessonTitle('');
              setLessonSubject('');
              setLessonTargetClass('');
              setUploadProgress(0);
              setIsLessonSent(true);
              setSuccessToast('Хичээл амжилттай нийтлэгдлээ!');
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
          setIsUploading(false);
        }
      };

      xhr.onerror = async () => {
        console.warn("Upload service network error, using local fallback");
        await fallbackLocalUpload();
      };

      xhr.send(formData);
    } catch (error) {
      console.error("Initiating video upload failed, using local fallback:", error);
      await fallbackLocalUpload();
    }
  };

  const handleGradeSubmission = async () => {
    if (!gradingSubmissionId || !gradeScore) {
      alert('Дүнгээ оруулна уу!');
      return;
    }
    try {
      await updateDoc(doc(db, 'student_submissions', gradingSubmissionId), {
        grade: gradeScore,
        feedback: gradeFeedback,
        gradedAt: serverTimestamp()
      });
      setStudentSubmissions(prev => prev.map(sub => 
        sub.id === gradingSubmissionId 
          ? { ...sub, grade: gradeScore, feedback: gradeFeedback } 
          : sub
      ));
      setGradingSubmissionId(null);
      setGradeScore('');
      setGradeFeedback('');
      alert('Дүн амжилттай хадгалагдлаа!');
    } catch (error) {
      console.error("Error grading submission:", error);
      alert("Алдаа гарлаа");
    }
  };

  const renderHome = () => (
    <div className="[perspective:1200px] space-y-8 select-none overflow-hidden">
      {/* 3D Holographic Teacher Banner */}
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
      >
        <ThreeDCard
          className="rounded-3xl bg-gradient-to-br from-indigo-650 via-indigo-500 to-violet-650 text-white"
          glowColor="rgba(99, 102, 241, 0.45)"
          intensity={1.15}
        >
          <div className="relative overflow-hidden p-8">
            {/* Animated reflection sweep */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000 pointer-events-none" />
            
            {/* Abstract 3D floating orb */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -right-12 -bottom-12 w-40 h-40 rounded-full bg-indigo-400/20 blur-xl animate-pulse pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 bg-gradient-to-tr from-white to-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-3xl shadow-[0_10px_25px_rgba(0,0,0,0.15),_inset_0_-4px_8px_rgba(0,0,0,0.1)] border border-white">
                    {(user.realName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-emerald-450 w-5 h-5 rounded-full border-4 border-indigo-500 animate-ping" />
                  <div className="absolute -bottom-1 -right-1 bg-emerald-450 w-5 h-5 rounded-full border-4 border-indigo-500" />
                </div>
                
                <div className="text-center sm:text-left">
                  <span className="text-[9px] bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-lg font-bold tracking-wider uppercase border border-white/10">БАГШИЙН КАБИНЕТ</span>
                  <h2 className="text-3xl font-black mt-2 tracking-tight drop-shadow-sm flex items-center justify-center sm:justify-start gap-2">
                    {user.realName || user.username}
                    <span className="text-xl">🎓</span>
                  </h2>
                  <p className="text-indigo-100 font-semibold mt-1 text-sm">{user.subject} хичээлийн заах арга зүйч багш</p>
                </div>
              </div>
              
              {/* Quick stats for teacher */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/15 text-center px-6 shadow-sm min-w-[124px] transition-transform duration-300 hover:scale-105">
                  <span className="block text-indigo-100 text-[10px] font-bold uppercase tracking-wider">Хариуцсан хичээл</span>
                  <span className="text-xl font-black font-mono tracking-tight mt-1.5 block uppercase truncate max-w-[110px]">{user.subject}</span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10 text-center px-6 shadow-sm min-w-[124px] transition-transform duration-300 hover:scale-105">
                  <span className="block text-indigo-100/60 text-[10px] font-bold uppercase tracking-wider">Системийн төлөв</span>
                  <span className="text-xl font-black font-mono text-emerald-350 tracking-tight mt-1.5 block">ИДЕВХТЭЙ</span>
                </div>
              </div>
            </div>
          </div>
        </ThreeDCard>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-hidden">
        {/* Rights Card */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.15 }}
        >
          <ThreeDCard
            className="bg-white rounded-3xl"
            glowColor="rgba(99, 102, 241, 0.18)"
            intensity={0.9}
          >
            <div className="relative p-7 h-full">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-100 text-indigo-650 rounded-2xl shadow-[0_8px_16px_rgba(79,70,229,0.15)] flex items-center justify-center">
                  <Star size={24} className="fill-indigo-200 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Багшийн Эрх</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Сурган хүмүүжүүлэх эрх зүйн баталгаа</p>
                </div>
              </div>
              
              <ul className="space-y-3.5 text-slate-650 relative z-10">
                {[
                  "Сургалтын хөтөлбөрийн дагуу хичээл заах арга барилаа чөлөөтэй сонгох",
                  "Сурагчдын мэдлэг, чадвар, оролцоог бодитоор хараат бус үнэлэх",
                  "Сургалтын орчин, хэрэглэгдэхүүнийг сайжруулах санал хүсэлт гаргах",
                  "Мэргэжил дээшлүүлэх, салбарын сургалт сорилтонд хамрагдах"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-2.5 bg-slate-50/55 rounded-xl border border-slate-50 hover:bg-indigo-50/40 hover:border-indigo-100 transition-all duration-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-750 text-xs font-black flex items-center justify-center mt-0.5">{idx + 1}</span>
                    <span className="text-sm font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ThreeDCard>
        </motion.div>

        {/* Duties Card */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.1, type: "spring", bounce: 0.25, delay: 0.3 }}
        >
          <ThreeDCard
            className="bg-white rounded-3xl"
            glowColor="rgba(139, 92, 246, 0.18)"
            intensity={0.9}
          >
            <div className="relative p-7 h-full">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-[100px] pointer-events-none" />
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-purple-100 text-purple-655 rounded-2xl shadow-[0_8px_16px_rgba(139,92,246,0.15)] flex items-center justify-center">
                  <Award size={24} className="fill-purple-200 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">Багшийн Үүрэг</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Сахих ёс зүй, хариуцлагын хэм хэмжээ</p>
                </div>
              </div>
              
              <ul className="space-y-3.5 text-slate-650 relative z-10">
                {[
                  "Хичээлийн бэлтгэлийг системтэй хангаж, чанартай сургалт явуулах",
                  "Сурагч бүрийн суралцах онцлогийг харгалзан, ялгаваргүй тэгш хандах",
                  "Сурагчдын ирц, ахиц дэвшлийг системд тогтмол бүртгэж, мэдээлэх",
                  "Багшийн ёс зүйн хэм хэмжээ, сургалтын нууцлалыг чанд баримтлах"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-2.5 bg-slate-50/55 rounded-xl border border-slate-50 hover:bg-purple-50/40 hover:border-purple-100 transition-all duration-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-750 text-xs font-black flex items-center justify-center mt-0.5">{idx + 1}</span>
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
    if (isLessonSent) {
      return (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 flex flex-col items-center text-center"
        >
          <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 size={48} className="text-teal-600" />
          </div>
          <h3 className="text-3xl font-bold text-slate-800 mb-4">Хичээл амжилттай нийтлэгдлээ!</h3>
          <p className="text-slate-500 text-lg mb-8 max-w-md">
            Таны байршуулсан хичээл (слайд/видео) сурагчдад амжилттай харагдах болно.
          </p>
          <button 
            onClick={() => { setIsLessonSent(false); setLessonView('menu'); }}
            className="px-8 py-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-lg hover:shadow-xl"
          >
            Буцах
          </button>
        </motion.div>
      );
    }

    if (lessonView === 'menu') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => setLessonView('add')}
            className="bg-gradient-to-br from-purple-500 to-pink-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4"
          >
            <PlusCircle size={48} />
            <span className="text-2xl font-bold">Хичээл нэмэх</span>
          </button>
          <button 
            onClick={() => setLessonView('view_published')}
            className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4"
          >
            <Video size={48} />
            <span className="text-2xl font-bold">Нийтэлсэн хичээлүүд</span>
          </button>
        </div>
      );
    }

    if (lessonView === 'view_published') {
      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Нийтэлсэн хичээлүүд</h3>
            <button onClick={() => setLessonView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
          </div>
          
          {isLoadingLessons ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : publishedLessons.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tl-xl">Анги</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Сэдэв</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Файл</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Огноо</th>
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tr-xl">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {publishedLessons.map(lesson => (
                    <tr key={lesson.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium">{lesson.className}</td>
                      <td className="py-3 px-4">{lesson.title}</td>
                      <td className="py-3 px-4 text-slate-500">{lesson.originalFileName}</td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {lesson.createdAt ? new Date(lesson.createdAt.toMillis()).toLocaleDateString() : 'Одоо'}
                      </td>
                      <td className="py-3 px-4">
                        <a 
                          href={lesson.videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Үзэх
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
              Одоогоор нийтэлсэн хичээл байхгүй байна.
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">Хичээл нэмэх</h3>
          <button onClick={() => setLessonView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
          {slideFile ? (
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 relative overflow-hidden">
              <div className="w-full flex flex-col items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
                <CheckCircle2 size={48} className="text-blue-200" />
                <span className="text-xl font-bold text-center truncate w-full px-4">{slideFile.name}</span>
                
                <div className="w-full space-y-3 mt-4 bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                  <input 
                    type="text" 
                    placeholder="Хичээлийн сэдэв" 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonTitle}
                    onChange={e => setLessonTitle(e.target.value)}
                  />
                  <select 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonSubject}
                    onChange={e => setLessonSubject(e.target.value)}
                  >
                    <option value="">Хичээл сонгох...</option>
                    <option value="Монгол хэл">Монгол хэл</option>
                    <option value="Математик">Математик</option>
                    <option value="Мэдээлэл зүй">Мэдээлэл зүй</option>
                    <option value="Англи хэл">Англи хэл</option>
                  </select>
                  <select 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonTargetClass}
                    onChange={e => setLessonTargetClass(e.target.value)}
                  >
                    <option value="">Анги сонгох...</option>
                    {allClasses.map(c => <option key={c} value={c}>{c} бүлэг</option>)}
                  </select>
                  
                  <button 
                    onClick={handlePublishSlide}
                    disabled={isUploading}
                    className="w-full py-3 bg-white text-blue-600 hover:bg-blue-50 rounded-lg font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        Түр хүлээнэ үү... {Math.round(uploadProgress)}%
                      </>
                    ) : 'Нийтлэх'}
                  </button>
                  <button 
                    onClick={() => setSlideFile(null)}
                    disabled={isUploading}
                    className="w-full py-2 text-blue-200 hover:text-white text-sm"
                  >
                    Цуцлах
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
              <input 
                type="file" 
                className="hidden" 
                accept=".ppt,.pptx,.pdf,.doc,.docx" 
                onChange={(e) => handleFileChange(e, 'slide')} 
              />
              <FileText size={48} className="group-hover:scale-110 transition-transform" />
              <span className="text-2xl font-bold">Слайд нэмэх</span>
              <span className="text-sm text-blue-200 opacity-0 group-hover:opacity-100 transition-opacity">Компьютероос файл сонгох</span>
            </label>
          )}
          
          {videoFile ? (
            <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 relative overflow-hidden">
              <div className="w-full flex flex-col items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
                <CheckCircle2 size={48} className="text-purple-200" />
                <span className="text-xl font-bold text-center truncate w-full px-4">{videoFile.name}</span>
                
                <div className="w-full space-y-3 mt-4 bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                  <input 
                    type="text" 
                    placeholder="Хичээлийн сэдэв" 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonTitle}
                    onChange={e => setLessonTitle(e.target.value)}
                  />
                  <select 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonSubject}
                    onChange={e => setLessonSubject(e.target.value)}
                  >
                    <option value="">Хичээл сонгох...</option>
                    <option value="Монгол хэл">Монгол хэл</option>
                    <option value="Математик">Математик</option>
                    <option value="Мэдээлэл зүй">Мэдээлэл зүй</option>
                    <option value="Англи хэл">Англи хэл</option>
                  </select>
                  <select 
                    className="w-full p-3 rounded-lg text-slate-800 outline-none"
                    value={lessonTargetClass}
                    onChange={e => setLessonTargetClass(e.target.value)}
                  >
                    <option value="">Анги сонгох...</option>
                    {allClasses.map(c => <option key={c} value={c}>{c} бүлэг</option>)}
                  </select>
                  
                  <button 
                    onClick={handlePublishVideo}
                    disabled={isUploading}
                    className="w-full py-3 bg-white text-purple-600 hover:bg-purple-50 rounded-lg font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                        Түр хүлээнэ үү... {Math.round(uploadProgress)}%
                      </>
                    ) : 'Нийтлэх'}
                  </button>
                  <button 
                    onClick={() => setVideoFile(null)}
                    disabled={isUploading}
                    className="w-full py-2 text-purple-200 hover:text-white text-sm"
                  >
                    Цуцлах
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer bg-gradient-to-br from-purple-500 to-pink-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
              <input 
                type="file" 
                className="hidden" 
                accept="video/*" 
                onChange={(e) => handleFileChange(e, 'video')} 
              />
              <Video size={48} className="group-hover:scale-110 transition-transform" />
              <span className="text-2xl font-bold">Бичлэг нэмэх</span>
              <span className="text-sm text-purple-200 opacity-0 group-hover:opacity-100 transition-opacity">Компьютероос бичлэг сонгох</span>
            </label>
          )}
        </div>
        
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Хичээл үзсэн байдал</h3>
          </div>
          
          <select 
            className="w-full md:w-64 p-3 border border-slate-200 rounded-xl mb-6 outline-none focus:border-blue-500"
            value={lessonClass}
            onChange={(e) => setLessonClass(e.target.value)}
          >
            <option value="">Анги сонгох...</option>
            {allClasses.map(cls => (
              <option key={cls} value={cls}>{cls} бүлэг</option>
            ))}
          </select>

          {lessonClass ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tl-xl">Анги</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Хичээлийн нэр</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Үзсэн сурагчид</th>
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tr-xl">Хувь</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-medium">{lessonClass}</td>
                    <td className="py-3 px-4">{mySubject} - {lessonTitle || 'Видео хичээл'}</td>
                    <td className="py-3 px-4">28 / 30</td>
                    <td className="py-3 px-4 text-emerald-600 font-bold">93%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              Хичээл үзсэн байдлыг харах ангиа сонгоно уу.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAssignments = () => {
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
              className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(13, 148, 136, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => { setAssignmentView('add'); setIsAssignmentSent(false); setAssignmentFile(null); }}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <PlusCircle size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Даалгавар нэмэх</span>
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
              className="bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(234, 88, 12, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => setAssignmentView('check')}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <CheckSquare size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Даалгавар шалгах</span>
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
              className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl h-full shadow-lg text-white"
              glowColor="rgba(79, 70, 229, 0.45)"
              intensity={1.15}
            >
              <button 
                onClick={() => setAssignmentView('view_sent')}
                className="p-8 w-full h-full flex flex-col items-center justify-center gap-4 text-center cursor-pointer group focus:outline-none"
              >
                <div className="p-3 bg-white/20 rounded-2xl group-hover:scale-110 transition-transform [transform:translateZ(20px)]">
                  <FileText size={48} />
                </div>
                <span className="text-2xl font-black tracking-wide [transform:translateZ(30px)]">Илгээсэн даалгавар</span>
              </button>
            </ThreeDCard>
          </motion.div>
        </div>
      );
    }

    if (assignmentView === 'view_sent') {
      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Илгээсэн даалгаврууд</h3>
            <button onClick={() => setAssignmentView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
          </div>
          
          {isLoadingSentAssignments ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : sentAssignments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tl-xl">Анги</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Сэдэв</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Файл</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Огноо</th>
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tr-xl">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {sentAssignments.map(assign => (
                    <tr key={assign.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium">{assign.className}</td>
                      <td className="py-3 px-4">{assign.title}</td>
                      <td className="py-3 px-4 text-slate-500">{assign.fileName}</td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {assign.createdAt ? new Date(assign.createdAt.toMillis()).toLocaleDateString() : 'Одоо'}
                      </td>
                      <td className="py-3 px-4">
                        <a 
                          href={assign.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Үзэх
                        </a>
                      </td>
                    </tr>
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

    if (assignmentView === 'check') {
      const filteredSubmissions = selectedClass 
        ? studentSubmissions.filter(sub => sub.className === selectedClass)
        : studentSubmissions;

      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Даалгавар шалгах</h3>
            <button onClick={() => setAssignmentView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
          </div>
          
          <select 
            className="w-full md:w-64 p-3 border border-slate-200 rounded-xl mb-6 outline-none focus:border-blue-500"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="">Бүх анги</option>
            {allClasses.map(cls => (
              <option key={cls} value={cls}>{cls} бүлэг</option>
            ))}
          </select>

          {isLoadingSubmissions ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : filteredSubmissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tl-xl">Анги</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Сурагчийн нэр</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Хичээл</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Файл</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Огноо</th>
                    <th className="py-3 px-4 text-slate-600 font-bold">Дүн</th>
                    <th className="py-3 px-4 text-slate-600 font-bold rounded-tr-xl">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map(sub => (
                    <React.Fragment key={sub.id}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-medium">{sub.className}</td>
                        <td className="py-3 px-4 font-medium">{sub.studentName}</td>
                        <td className="py-3 px-4 text-slate-600">{sub.subject}</td>
                        <td className="py-3 px-4 text-slate-500">{sub.fileName}</td>
                        <td className="py-3 px-4 text-sm text-slate-500">
                          {sub.createdAt ? new Date(sub.createdAt.toMillis()).toLocaleString() : 'Одоо'}
                        </td>
                        <td className="py-3 px-4 font-medium text-blue-600">
                          {sub.grade ? `${sub.grade}` : '-'}
                        </td>
                        <td className="py-3 px-4 flex gap-3">
                          <a 
                            href={sub.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Үзэх
                          </a>
                          <button 
                            onClick={() => {
                              setGradingSubmissionId(gradingSubmissionId === sub.id ? null : sub.id);
                              setGradeScore(sub.grade || '');
                              setGradeFeedback(sub.feedback || '');
                            }}
                            className="text-amber-600 hover:underline font-medium"
                          >
                            {sub.grade ? 'Засах' : 'Дүгнэх'}
                          </button>
                        </td>
                      </tr>
                      {gradingSubmissionId === sub.id && (
                        <tr className="bg-amber-50">
                          <td colSpan={7} className="p-4">
                            <div className="flex gap-4 items-start">
                              <div className="flex-1">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Дүн (Оноо эсвэл үнэлгээ)</label>
                                <input 
                                  type="text" 
                                  value={gradeScore}
                                  onChange={(e) => setGradeScore(e.target.value)}
                                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-500"
                                  placeholder="Жишээ нь: 100, A, Сайн"
                                />
                              </div>
                              <div className="flex-[2]">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Сэтгэгдэл / Зөвлөгөө</label>
                                <input 
                                  type="text" 
                                  value={gradeFeedback}
                                  onChange={(e) => setGradeFeedback(e.target.value)}
                                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-500"
                                  placeholder="Сурагчид өгөх зөвлөгөө..."
                                />
                              </div>
                              <div className="flex items-end pb-1">
                                <button 
                                  onClick={handleGradeSubmission}
                                  className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-amber-600 transition-colors"
                                >
                                  Хадгалах
                                </button>
                              </div>
                            </div>
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
              Одоогоор ирсэн даалгавар байхгүй байна.
            </div>
          )}
        </div>
      );
    }

    // Add Assignment View
    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Даалгавар нэмэх</h3>
          <button onClick={() => setAssignmentView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
        </div>
        
        {isAssignmentSent ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-emerald-50 rounded-2xl p-8 flex flex-col items-center text-center border border-emerald-100"
          >
            <CheckCircle2 size={64} className="text-emerald-500 mb-4" />
            <h3 className="text-2xl font-bold text-emerald-700 mb-2">Амжилттай нийтлэгдлээ</h3>
            <p className="text-emerald-600 mb-6">Даалгавар сурагчдад харагдах болно.</p>
            <button 
              onClick={() => { setIsAssignmentSent(false); setAssignmentFile(null); }}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Шинэ даалгавар нэмэх
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Даалгаврын сэдэв / Нэр</label>
              <input 
                type="text" 
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="Даалгаврын нэрийг оруулна уу"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Анги сонгох</label>
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-medium"
              >
                <option value="">Бүх ангид эсвэл сонгох...</option>
                {allClasses.map(cls => (
                  <option key={cls} value={cls}>{cls} бүлэг</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Даалгаврын файл байршуулах</label>
              <label className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-600 transition-all group cursor-pointer">
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={(e) => handleFileChange(e, 'assignment')} 
                />
                {assignmentFile ? (
                  <>
                    <FileText size={48} className="mb-4 text-teal-500" />
                    <span className="font-bold text-lg text-teal-700">{assignmentFile.name}</span>
                    <span className="text-sm mt-2 opacity-70">Өөр файл сонгох</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={48} className="mb-4 text-slate-400 group-hover:text-teal-500 transition-colors" />
                    <span className="font-bold text-lg">Энд дарж файл оруулна уу</span>
                    <span className="text-sm mt-2 opacity-70">Компьютероос сонгох (PDF, DOCX, JPG)</span>
                  </>
                )}
              </label>
            </div>

            <button 
              onClick={handlePublishAssignment}
              disabled={isUploadingAssignment || !assignmentFile || !selectedClass || !assignmentTitle}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isUploadingAssignment ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Түр хүлээнэ үү... {Math.round(uploadAssignmentProgress)}%
                </>
              ) : 'Даалгавар нийтлэх'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderAttendance = () => {
    if (attendanceView === 'menu') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => {
              setAttendanceView('record');
              setSelectedClass('');
              setCurrentAttendance({});
              setAttendanceSuccess('');
            }}
            className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4"
          >
            <Users size={48} />
            <span className="text-2xl font-bold">Ирц бүртгэх</span>
          </button>
          <button 
            onClick={() => {
              setAttendanceView('view');
              setSelectedClass('');
            }}
            className="bg-gradient-to-br from-purple-500 to-pink-600 p-8 rounded-3xl text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-4"
          >
            <CheckSquare size={48} />
            <span className="text-2xl font-bold">Бүртгэсэн ирц харах</span>
          </button>
        </div>
      );
    }

    if (attendanceView === 'view') {
      const groupedRecords: Record<string, AttendanceRecord[]> = {};
      const sortedRecords = [...attendanceRecords].sort((a, b) => b.date.localeCompare(a.date));
      
      sortedRecords.forEach(record => {
        const monthYear = record.date.substring(0, 7); // "YYYY-MM"
        if (!groupedRecords[monthYear]) {
          groupedRecords[monthYear] = [];
        }
        groupedRecords[monthYear].push(record);
      });

      const formatMonthYear = (yyyyMm: string) => {
        const [year, month] = yyyyMm.split('-');
        return `${year} оны ${parseInt(month)}-р сар`;
      };

      return (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800">Бүртгэсэн ирц харах</h3>
            <button onClick={() => setAttendanceView('menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
          </div>

          {Object.keys(groupedRecords).length > 0 ? (
            <div className="space-y-8">
              {Object.keys(groupedRecords).map(monthYear => (
                <div key={monthYear} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-100 px-6 py-4 border-b border-slate-200">
                    <h4 className="font-bold text-lg text-slate-800">{formatMonthYear(monthYear)}</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-sm">
                          <th className="py-3 px-6 text-slate-600 font-bold">Огноо</th>
                          <th className="py-3 px-6 text-slate-600 font-bold">Анги</th>
                          <th className="py-3 px-4 text-slate-600 font-bold text-center">Ирсэн</th>
                          <th className="py-3 px-4 text-slate-600 font-bold text-center">Тасалсан</th>
                          <th className="py-3 px-4 text-slate-600 font-bold text-center">Чөлөөтэй</th>
                          <th className="py-3 px-4 text-slate-600 font-bold text-center">Өвчтэй</th>
                          <th className="py-3 px-6 text-slate-600 font-bold text-center">Үйлдэл</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedRecords[monthYear].map(record => {
                          const counts = { present: 0, absent: 0, excused: 0, sick: 0 };
                          Object.values(record.data).forEach(status => counts[status as AttendanceStatus]++);
                          const isExpanded = expandedRecordId === record.id;
                          
                          return (
                            <React.Fragment key={record.id}>
                              <tr 
                                className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer select-none transition-colors"
                                onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                              >
                                <td className="py-3.5 px-6 font-semibold text-slate-800 flex items-center gap-2">
                                  <span className={`inline-block transform transition-transform duration-200 text-[10px] text-slate-400 font-bold ${isExpanded ? 'rotate-90 text-indigo-600' : ''}`}>▶</span>
                                  {record.date}
                                </td>
                                <td className="py-3.5 px-6 font-bold text-blue-600">{record.className} бүлэг</td>
                                <td className="py-3.5 px-4 text-center text-emerald-600 font-black">{counts.present}</td>
                                <td className="py-3.5 px-4 text-center text-red-600 font-black">{counts.absent}</td>
                                <td className="py-3.5 px-4 text-center text-amber-500 font-black">{counts.excused}</td>
                                <td className="py-3.5 px-4 text-center text-blue-500 font-black">{counts.sick}</td>
                                <td className="py-3.5 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-4">
                                    <button 
                                      onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                                      className="text-slate-500 hover:text-indigo-600 font-bold text-xs cursor-pointer select-none"
                                    >
                                      {isExpanded ? 'Хаах' : 'Нэрс харах'}
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setEditingRecordId(record.id);
                                        setSelectedClass(record.className);
                                        
                                        // Normalize keys to support custom username mapping of saved statuses
                                        const normalizedAtt: Record<string, AttendanceStatus> = {};
                                        Object.entries(record.data).forEach(([studentKeyName, status]) => {
                                          const matchedStudent = allStudents.find(s => s.username === studentKeyName || s.realName === studentKeyName || (s.realName || s.username) === studentKeyName);
                                          const finalKey = matchedStudent ? matchedStudent.username : studentKeyName;
                                          normalizedAtt[finalKey] = status as AttendanceStatus;
                                        });

                                        setCurrentAttendance(normalizedAtt);
                                        setAttendanceView('edit');
                                        setAttendanceSuccess('');
                                      }}
                                      className="text-indigo-600 hover:text-indigo-800 font-bold text-xs hover:underline cursor-pointer select-none bg-indigo-50 px-2.5 py-1 rounded-lg"
                                    >
                                      Засах
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-slate-50/50">
                                  <td colSpan={7} className="px-6 py-4 border-b border-slate-100">
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs">
                                      <h5 className="font-extrabold text-[11px] text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 select-none">
                                        <Users size={12} className="text-blue-500" />
                                        Ирцийн бүртгэлийн нэрс ({record.className} бүлэг)
                                      </h5>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {Object.entries(record.data).map(([studentName, status]) => {
                                          let statusName = '';
                                          let badgeColor = '';
                                          if (status === 'present') { statusName = 'Ирсэн'; badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100'; }
                                          else if (status === 'absent') { statusName = 'Тасалсан'; badgeColor = 'bg-red-50 text-red-700 border border-red-100'; }
                                          else if (status === 'excused') { statusName = 'Чөлөөтэй'; badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100'; }
                                          else if (status === 'sick') { statusName = 'Өвчтэй'; badgeColor = 'bg-blue-50 text-blue-700 border border-blue-100'; }

                                          return (
                                            <div key={studentName} className="flex items-center justify-between px-3 py-2 bg-slate-50/40 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                                              <span className="font-semibold text-slate-700 text-xs truncate max-w-[140px]" title={studentName}>{getStudentRealName(studentName)}</span>
                                              <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${badgeColor}`}>
                                                {statusName}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
              Одоогоор бүртгэсэн ирц байхгүй байна.
            </div>
          )}
        </div>
      );
    }

    // Record or Edit view
    const isEditing = attendanceView === 'edit';
    
    return (
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">
            {isEditing ? 'Ирц засах' : 'Ирц бүртгэх'}
          </h3>
          <button onClick={() => setAttendanceView(isEditing ? 'view' : 'menu')} className="text-blue-600 hover:underline font-medium">Буцах</button>
        </div>
        
        {attendanceSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold flex items-center gap-2"
          >
            <CheckCircle2 size={20} />
            {attendanceSuccess}
          </motion.div>
        )}

        <select 
          className="w-full md:w-64 p-3 border border-slate-200 rounded-xl mb-6 outline-none focus:border-blue-500 disabled:opacity-50"
          value={selectedClass}
          disabled={isEditing}
          onChange={(e) => {
            const cls = e.target.value;
            setSelectedClass(cls);
            setAttendanceSuccess('');
          }}
        >
          <option value="">Анги сонгох...</option>
          {allClasses.map(cls => (
            <option key={cls} value={cls}>{cls} бүлэг</option>
          ))}
        </select>

        {selectedClass && (
          <div className="overflow-x-auto">
            {isLoadingClassStudents ? (
              <div className="py-12 text-center text-slate-500 font-semibold flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-blue-600" size={28} />
                <span>Сурагчдыг ачаалж байна, түр хүлээнэ үү...</span>
              </div>
            ) : currentClassStudents.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-bold bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                <span>Бүртгэлтэй сурагч байхгүй байна.</span>
                <p className="text-xs text-slate-400 font-normal">Сонгосон {selectedClass} бүлэгт бүртгэлтэй сурагч одоогоор алга байна.</p>
              </div>
            ) : (
              <>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50">
                      <th className="py-3 px-4 text-slate-600 font-bold rounded-tl-xl">Овог нэр</th>
                      <th className="py-3 px-4 text-slate-600 font-bold text-center">Ирсэн</th>
                      <th className="py-3 px-4 text-slate-600 font-bold text-center">Тасалсан</th>
                      <th className="py-3 px-4 text-slate-600 font-bold text-center">Чөлөөтэй</th>
                      <th className="py-3 px-4 text-slate-600 font-bold text-center rounded-tr-xl">Өвчтэй</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentClassStudents.map((student, idx) => {
                      const studentName = student.realName || getStudentRealName(student.username) || student.username;
                      const studentKey = student.username;
                      return (
                        <tr key={student.id || student.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-medium flex items-center gap-1.5">
                            <span>{studentName}</span>
                            {student.hasGoldBadge && (
                              <span className="inline-flex items-center text-amber-550 select-none animate-pulse" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                                <Award size={15} className="fill-amber-400 stroke-amber-600 font-bold" />
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input 
                              type="radio" 
                              name={`att_${idx}`} 
                              className="w-5 h-5 accent-emerald-500 cursor-pointer" 
                              checked={currentAttendance[studentKey] === 'present'}
                              onChange={() => setCurrentAttendance(prev => ({ ...prev, [studentKey]: 'present' }))}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input 
                              type="radio" 
                              name={`att_${idx}`} 
                              className="w-5 h-5 accent-red-500 cursor-pointer" 
                              checked={currentAttendance[studentKey] === 'absent'}
                              onChange={() => setCurrentAttendance(prev => ({ ...prev, [studentKey]: 'absent' }))}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input 
                              type="radio" 
                              name={`att_${idx}`} 
                              className="w-5 h-5 accent-amber-500 cursor-pointer" 
                              checked={currentAttendance[studentKey] === 'excused'}
                              onChange={() => setCurrentAttendance(prev => ({ ...prev, [studentKey]: 'excused' }))}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input 
                              type="radio" 
                              name={`att_${idx}`} 
                              className="w-5 h-5 accent-blue-500 cursor-pointer" 
                              checked={currentAttendance[studentKey] === 'sick'}
                              onChange={() => setCurrentAttendance(prev => ({ ...prev, [studentKey]: 'sick' }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-6 flex justify-end">
                  <button 
                    onClick={async () => {
                      if (isEditing && editingRecordId) {
                        try {
                          await updateDoc(doc(db, 'attendance', editingRecordId), { data: currentAttendance });
                          setAttendanceRecords(prev => prev.map(rec => 
                            rec.id === editingRecordId ? { ...rec, data: currentAttendance } : rec
                          ));
                          setAttendanceSuccess('Ирц амжилттай засагдлаа!');
                        } catch (error) {
                          console.error("Error updating attendance:", error);
                          alert("Алдаа гарлаа");
                        }
                      } else {
                        try {
                          const newRecordData = {
                            date: new Date().toISOString().split('T')[0],
                            className: selectedClass,
                            data: currentAttendance,
                            teacher: user.username,
                            createdAt: serverTimestamp()
                          };
                          const docRef = await addDoc(collection(db, 'attendance'), newRecordData);
                          const newRecord: AttendanceRecord = {
                            id: docRef.id,
                            date: newRecordData.date,
                            className: newRecordData.className,
                            data: newRecordData.data
                          };
                          setAttendanceRecords(prev => [newRecord, ...prev]);
                          setAttendanceSuccess('Амжилттай бүртгэгдлээ!');
                        } catch (error) {
                          console.error("Error saving attendance:", error);
                          alert("Алдаа гарлаа");
                        }
                      }
                    }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
                  >
                    <CheckCircle2 size={20} />
                    {isEditing ? 'Өөрчлөлтийг хадгалах' : 'Ирц хадгалах'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderGrades = () => {
    // Filter students by search query
    const filteredStudents = gradebookStudents.filter(s => 
      s.realName.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      s.username.toLowerCase().includes(studentSearchQuery.toLowerCase())
    );

    return (
      <div className="space-y-6">
        {/* Top Management Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Class and Subject Selectors Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
            <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileSpreadsheet className="text-blue-500" size={20} />
              Анги, Сэдэв сонгох
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Анги сонгох</label>
                <select
                  value={gradebookClass}
                  onChange={(e) => setGradebookClass(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700 hover:border-slate-300 transition-colors"
                >
                  {allClasses.map(cls => (
                    <option key={cls} value={cls}>{cls} бүлэг</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Хичээл / Сэдэв</label>
                <input
                  type="text"
                  value={gradebookSubject}
                  onChange={(e) => setGradebookSubject(e.target.value)}
                  placeholder="Жишээ: Математик"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold text-slate-700 hover:border-slate-300 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Statistics Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Award className="text-amber-500" size={20} />
              Тойм статистик
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 font-bold mb-1 col-span-1">Нийт сурагч</p>
                <p className="text-2xl font-black text-slate-800">{gradebookStudents.length}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 font-bold mb-1 col-span-1">Хичээл/Сэдэв</p>
                <p className="text-2xl font-black text-slate-800">{gradebookColumns.length}</p>
              </div>
              <div className="p-4 bg-blue-50/50 rounded-2xl col-span-2 flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-bold">Нийт хамрагдалт</p>
                  <p className="text-lg font-black text-blue-800">
                    {(() => {
                      const totalCells = gradebookStudents.length * (gradebookColumns.length || 1);
                      let completedCount = 0;
                      gradebookStudents.forEach(s => {
                        gradebookColumns.forEach(c => {
                          const grade = gradebookGrades[`${s.username}_${c.id}`];
                          if (grade && grade.status === 'completed') completedCount++;
                        });
                      });
                      return `${Math.round((completedCount / totalCells) * 100)}%`;
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-bold">Дундаж дүн</p>
                  <p className="text-lg font-black text-slate-800">
                    {(() => {
                      let sum = 0;
                      let count = 0;
                      Object.values(gradebookGrades).forEach((g: any) => {
                        if (g && g.score !== null && g.score !== undefined) {
                          sum += g.score;
                          count++;
                        }
                      });
                      return count > 0 ? `${Math.round(sum / count)}%` : '-';
                    })()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Visibility and Controls Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
            <div>
              <h4 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                {gradebookVisibility ? <Eye className="text-emerald-500" size={20} /> : <EyeOff className="text-red-500" size={20} />}
                Сурагчдад харуулах
              </h4>
              <p className="text-slate-500 text-xs leading-relaxed mb-4">
                Сонгосон ангийн сурагчид өөрсдийн хувийн дүн, гүйцэтгэлийг системээс харах боломжтой эсэхийг тохируулна.
              </p>
            </div>
            
            <button
              onClick={handleToggleVisibility}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all duration-300 ${
                gradebookVisibility
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {gradebookVisibility ? <Eye size={18} /> : <EyeOff size={18} />}
              {gradebookVisibility ? 'Дүн нээлттэй байна' : 'Дүн хаалттай байна'}
            </button>
          </div>
        </div>

        {/* Excel Spreadsheet Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="text-teal-600" size={22} />
                Ерөнхий дүнгийн Excel хүснэгт
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                Нүд тус бүр дээр дарж гүйцэтгэлийг шинэчлэх ба % утгыг бичихэд автоматаар хадгалагдано.
              </p>
            </div>
            
            <div className="w-full md:w-72">
              <input
                type="text"
                placeholder="Сурагчийн нэрээр хайх..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 font-medium transition-colors"
              />
            </div>
          </div>

          {isLoadingGradebook ? (
            <div className="py-24 text-center">
              <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
              <p className="text-slate-500 font-semibold text-sm">Хүснэгтийг ачаалж байна, түр хүлээнэ үү...</p>
            </div>
          ) : gradebookColumns.length === 0 ? (
            <div className="py-24 text-center px-6">
              <div className="max-w-md mx-auto">
                <HelpCircle className="text-slate-300 mx-auto mb-4" size={48} />
                <h4 className="text-lg font-bold text-slate-700 mb-1">Хичээл/Сэдэв байхгүй байна</h4>
                <p className="text-slate-400 text-xs mb-6">
                  {gradebookClass} ангид {gradebookSubject} хичээлээр нийтэлсэн сургалтын видео эсвэл даалгавар одоогоор байхгүй байна. 
                </p>
                <div className="flex justify-center gap-3">
                  <button onClick={() => { setActiveTab('lessons'); setLessonView('add'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-sm transition-all">Хичээл нэмэх</button>
                  <button onClick={() => { setActiveTab('assignments'); setAssignmentView('add'); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all">Даалгавар үүсгэх</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                    <th className="py-4 px-6 sticky left-0 bg-slate-50/90 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200 min-w-[200px]">Сурагч</th>
                    <th className="py-4 px-4 text-center border-r border-slate-200 bg-blue-50/40 text-blue-700 font-extrabold min-w-[120px]">Нийт дундаж</th>
                    {gradebookColumns.map(col => (
                      <th key={col.id} className="py-4 px-4 border-r border-slate-200 min-w-[220px]">
                        <div className="flex flex-col">
                          <span className="truncate max-w-[200px] text-slate-800 font-bold normal-case text-sm" title={col.title}>
                            {col.title}
                          </span>
                          <span className={`text-[10px] uppercase font-bold tracking-wider w-max px-2 py-0.5 rounded mt-1 ${
                            col.type === 'lesson' ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-purple-50 text-purple-700 border border-purple-100'
                          }`}>
                            {col.type === 'lesson' ? 'Хичээл' : 'Даалгавар'}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={gradebookColumns.length + 2} className="py-24 text-center font-bold text-slate-500 bg-slate-50/20">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p className="text-base text-slate-700">Бүртгэлтэй сурагч байхгүй байна.</p>
                          <p className="text-xs text-slate-400 font-normal">Сонгосон {gradebookClass} ангид бүртгэлтэй сурагч одоогоор алга байна эсвэл хайлтад олдсонгүй.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, sIdx) => {
                      // Calculate individual average score
                      let totalScore = 0;
                      let scoreCount = 0;
                      let completedTasks = 0;

                      gradebookColumns.forEach(col => {
                        const grade = gradebookGrades[`${student.username}_${col.id}`];
                        if (grade) {
                          if (grade.status === 'completed') completedTasks++;
                          if (grade.score !== null) {
                            totalScore += grade.score;
                            scoreCount++;
                          }
                        }
                      });

                      const individualAvg = scoreCount > 0 ? Math.round(totalScore / scoreCount) : null;
                      const completionRate = Math.round((completedTasks / gradebookColumns.length) * 100);

                      return (
                      <tr key={student.username} className="hover:bg-slate-50/40 group transition-all">
                        {/* Student Info */}
                        <td className="py-3 px-6 sticky left-0 bg-white group-hover:bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200 font-bold text-slate-800">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 text-xs w-4">{sIdx + 1}</span>
                              <span className="flex items-center gap-1.5">
                                <span>{student.realName}</span>
                                {student.hasGoldBadge && (
                                  <span className="inline-flex items-center text-amber-550 select-none" title="Шалгалтандаа 90-ээс дээш оноо авсан сурагч">
                                    <Award size={15} className="fill-amber-400 stroke-amber-600 font-bold animate-pulse" />
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Overall Percent Badge */}
                        <td className="py-3 px-4 border-r border-slate-200 bg-blue-50/10 group-hover:bg-blue-50/20 text-center font-extrabold text-blue-700 text-sm">
                          {individualAvg !== null ? (
                            <div className="flex flex-col items-center justify-center">
                              <span className="text-sm font-black">{individualAvg}%</span>
                              <span className="text-[9px] text-slate-400 font-medium font-sans">хамралт: {completionRate}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Interactive Graded Cells */}
                        {gradebookColumns.map(col => {
                          const cellKey = `${student.username}_${col.id}`;
                          const grade = gradebookGrades[cellKey] || { status: 'not_completed', score: null };
                          const isSaving = isSavingCell[cellKey];

                          return (
                            <td key={col.id} className="p-2 border-r border-slate-200 text-center align-middle hover:bg-slate-100/20 relative">
                              <div className="flex items-center justify-center gap-3">
                                {/* Completion Checkmark */}
                                <button
                                  onClick={() => handleCellUpdate(
                                    student,
                                    col,
                                    'status',
                                    grade.status === 'completed' ? 'not_completed' : 'completed'
                                  )}
                                  className={`rounded-full p-1.5 transition-colors focus:ring-2 focus:ring-offset-2 ${
                                    grade.status === 'completed'
                                      ? 'bg-emerald-50 text-emerald-600 focus:ring-emerald-500 hover:bg-emerald-100/50'
                                      : 'bg-slate-50 text-slate-300 focus:ring-slate-400 hover:bg-slate-100'
                                  }`}
                                  title={grade.status === 'completed' ? 'Хийсэн гэж тэмдэглэсэн (товшиж цуцлах)' : 'Хийгээгүй гэж тэмдэглэсэн (товшиж дуусгах)'}
                                >
                                  {grade.status === 'completed' ? (
                                    <CheckCircle2 size={16} className="fill-emerald-100/20" />
                                  ) : (
                                    <div className="w-4 h-4 border-2 border-dashed border-slate-300 rounded-full" />
                                  )}
                                </button>

                                {/* Percentage Score Input */}
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={grade.score !== null ? grade.score : ''}
                                    placeholder="-"
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        handleCellUpdate(student, col, 'score', '');
                                      } else {
                                        const num = Math.min(100, Math.max(0, parseInt(val)));
                                        handleCellUpdate(student, col, 'score', num);
                                      }
                                    }}
                                    className={`w-14 text-center rounded-lg border text-sm font-bold p-1 bg-slate-50/50 outline-none focus:bg-white focus:border-indigo-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${
                                      grade.status === 'completed' ? 'border-slate-200 text-slate-800' : 'border-slate-100 text-slate-300'
                                    }`}
                                  />
                                  <span className={`text-[10px] font-black ${grade.status === 'completed' ? 'text-slate-400' : 'text-slate-200'}`}>%</span>
                                </div>
                              </div>

                              {/* Tiny Auto-saving indicator */}
                              {isSaving && (
                                <div className="absolute right-1 top-1">
                                  <Loader2 size={10} className="animate-spin text-indigo-500" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuizzes = () => {
    if (quizzesView === 'add') {
      return (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">Шалгалт үүсгэх</h3>
            <button 
              onClick={() => {
                setQuizzesView('menu');
                setNewQuizQuestions([]);
              }} 
              className="text-blue-600 hover:underline font-medium flex items-center gap-1 cursor-pointer"
            >
              Буцах
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Quiz Info & Questions Draft List */}
            <div className="lg:col-span-1 space-y-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm animate-fade-in">
              <h4 className="font-bold text-slate-700 border-b border-slate-50 pb-2">1. Үндсэн мэдээлэл</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Шалгалтын сэдэв / Гарчиг</label>
                  <input 
                    type="text" 
                    placeholder="Жишээ: Математикийн сорил 1" 
                    className="w-full p-3 rounded-lg border border-slate-200 outline-none focus:border-blue-500 text-slate-800"
                    value={newQuizTitle}
                    onChange={e => setNewQuizTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Хичээл</label>
                  <select 
                    className="w-full p-3 rounded-lg border border-slate-200 text-slate-800 outline-none"
                    value={newQuizSubject}
                    onChange={e => setNewQuizSubject(e.target.value)}
                  >
                    <option value="">Хичээл сонгох...</option>
                    <option value="Монгол хэл">Монгол хэл</option>
                    <option value="Математик">Математик</option>
                    <option value="Мэдээлэл зүй">Мэдээлэл зүй</option>
                    <option value="Англи хэл">Англи хэл</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Анги</label>
                  <select 
                    className="w-full p-3 rounded-lg border border-slate-200 text-slate-800 outline-none"
                    value={newQuizClass}
                    onChange={e => setNewQuizClass(e.target.value)}
                  >
                    <option value="">Анги сонгох...</option>
                    {allClasses.map(c => <option key={c} value={c}>{c} бүлэг</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-700 mb-2 flex justify-between items-center">
                  <span>Асуултууд ({newQuizQuestions.length})</span>
                  {newQuizQuestions.length > 0 && (
                    <button 
                      onClick={() => setNewQuizQuestions([])} 
                      className="text-xs text-red-500 hover:underline cursor-pointer"
                    >
                      Бүгдийг устгах
                    </button>
                  )}
                </h4>
                {newQuizQuestions.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Асуулт нэмэгдээгүй байна
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {newQuizQuestions.map((q, idx) => (
                      <div key={q.id} className="p-3 bg-slate-50 rounded-lg text-xs flex justify-between items-start gap-2 border border-slate-100">
                        <div className="truncate flex-1">
                          <span className="font-bold text-slate-600 mr-1">{idx + 1}.</span> 
                          {q.type === 'image' ? '[Зурагт асуулт]' : q.questionText}
                        </div>
                        <button 
                          onClick={() => setNewQuizQuestions(newQuizQuestions.filter(item => item.id !== q.id))}
                          className="text-red-500 hover:text-red-700 cursor-pointer animate-pulse"
                        >
                          Устгах
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={handlePublishQuiz}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <PlusCircle size={18} />
                Шалгалт нийтлэх
              </button>
            </div>

            {/* Right Column: Question Constructing Field */}
            <div className="lg:col-span-2 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 p-6 rounded-2xl border border-blue-100 shadow-sm space-y-6">
              <h4 className="text-lg font-bold text-blue-900 border-b border-blue-100 pb-2">2. Асуулт бэлдэх</h4>
              
              {/* Question Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Асуултын хэлбэр</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => { setCurQuestionType('text'); setCurQuestionText(''); }}
                    className={`p-3 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      curQuestionType === 'text'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <FileText size={16} />
                    Та асуултаа бичнэ үү
                  </button>
                  <button
                    onClick={() => { setCurQuestionType('image'); setCurQuestionText(''); }}
                    className={`p-3 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      curQuestionType === 'image'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <Video size={16} />
                    Зургаар оруулна уу
                  </button>
                </div>
              </div>

              {/* Question Source */}
              {curQuestionType === 'text' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Асуултын бичвэр</label>
                  <textarea 
                    rows={3}
                    placeholder="Асуултаа энд бичнэ үү..." 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none bg-white focus:border-blue-500 text-slate-800"
                    value={curQuestionText}
                    onChange={e => setCurQuestionText(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Асуултын зураг сонгох</label>
                  {curQuestionText ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-60 bg-white flex justify-center items-center p-4">
                      <img src={curQuestionText} alt="Draft question" className="max-h-52 object-contain rounded-lg shadow-sm" />
                      <button 
                        onClick={() => setCurQuestionText('')} 
                        className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-md cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white cursor-pointer hover:border-blue-500 transition-colors">
                      <UploadCloud size={36} className="text-slate-400 mb-2 animate-bounce" />
                      <span className="font-bold text-slate-600 block">Зураг сонгох</span>
                      <span className="text-xs text-slate-400">800KB доош хэмжээтэй зураг</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleQuizQuestionImageChange}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Options (A, B, C, D) */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Хариултын хувилбарууд (A, B, C, D)</label>
                {['A', 'B', 'C', 'D'].map((label, index) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
                      {label}
                    </span>
                    <input 
                      type="text" 
                      placeholder={`${label} хувилбарын хариултыг бичнэ үү`}
                      className="flex-1 p-2.5 rounded-lg border border-slate-200 outline-none bg-white focus:border-blue-500 text-slate-800"
                      value={curQuestionOptions[index]}
                      onChange={e => {
                        const nextOptions = [...curQuestionOptions];
                        nextOptions[index] = e.target.value;
                        setCurQuestionOptions(nextOptions);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setCurCorrectAnswer(index)}
                      className={`px-3 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        curCorrectAnswer === index
                          ? 'bg-emerald-500 text-white shadow-sm font-extrabold'
                          : 'bg-white text-slate-400 border border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      {curCorrectAnswer === index ? 'ЗӨВ' : 'СОНГОХ'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Question Button */}
              <div className="pt-4 border-t border-blue-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddQuestionToDraft}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform"
                >
                  <PlusCircle size={18} />
                  Энэ асуултыг нэмэх
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (quizzesView === 'submissions' && selectedQuiz) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {selectedQuiz.className} ангийн {selectedQuiz.subject} шалгалт
              </span>
              <h3 className="text-xl font-black text-slate-800 mt-1">{selectedQuiz.title}</h3>
            </div>
            <button 
              onClick={() => {
                setQuizzesView('menu');
                setSelectedQuiz(null);
                setQuizStudentSubmissions([]);
              }} 
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-bold text-sm flex items-center gap-1 cursor-pointer"
            >
              Буцах
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h4 className="font-extrabold text-slate-700 bg-slate-50 border-b border-slate-100 px-6 py-4">
              Сурагчдын ирүүлсэн шалгалтын хуудас ({quizStudentSubmissions.length})
            </h4>
            {quizStudentSubmissions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-6">Сурагчийн нэр</th>
                      <th className="py-3 px-6">Зөв бөглөсөн асуулт</th>
                      <th className="py-3 px-6">Хувь (%)</th>
                      <th className="py-3 px-6">Ирүүлсэн хугацаа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizStudentSubmissions.map(sub => {
                      const pct = Math.round((sub.score / sub.totalQuestions) * 100);
                      let themeColor = 'text-red-500 bg-red-100';
                      if (pct >= 85) themeColor = 'text-green-600 bg-green-100';
                      else if (pct >= 60) themeColor = 'text-blue-600 bg-blue-100';
                      else if (pct >= 40) themeColor = 'text-amber-600 bg-amber-100';

                      return (
                        <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/30">
                          <td className="py-4 px-6 font-bold text-slate-800">{sub.studentName}</td>
                          <td className="py-4 px-6 font-medium text-slate-600">
                            {sub.score} / {sub.totalQuestions}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${themeColor}`}>
                              {pct}%
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-500">
                            {sub.createdAt ? new Date(sub.createdAt.seconds * 1000).toLocaleString() : 'Одоо'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400">
                Одоогоор шалгалтыг өгсөн сурагч байхгүй байна.
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex-col sm:flex-row gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
              <Award className="text-blue-600" />
              Идэвхтэй сорилт, шалгалтууд
            </h3>
            <p className="text-xs text-slate-500 mt-1">Нийтэлсэн шалгалтуудаа хянах, үр дүн үзэх эсвэл шинэ шалгалт үүсгэх.</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              setNewQuizSubject(user.subject || 'Математик');
              setQuizzesView('add');
            }}
            className="px-5 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle size={18} />
            Шалгалт үүсгэх
          </button>
        </div>

        {isLoadingQuizzes ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 size={36} className="animate-spin text-blue-600" />
          </div>
        ) : quizzesList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzesList.map(quiz => (
              <div 
                key={quiz.id} 
                className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {quiz.subject}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">{quiz.className} бүлэг</span>
                  </div>
                  
                  <h4 className="text-lg font-bold text-slate-800 line-clamp-1">{quiz.title}</h4>
                  
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <HelpCircle size={14} className="text-slate-400" />
                    <span>Нийт {quiz.questions?.length || 0} асуулттай</span>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-50 flex justify-between items-center">
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedQuiz(quiz);
                      setQuizzesView('submissions');
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    Үр дүн үзэх &rarr;
                  </button>
                  <button 
                    type="button"
                    onClick={() => setQuizIdToDelete(quiz.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer"
                  >
                    Устгах
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-500 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3">
            <Award size={48} className="text-slate-300 animate-pulse" />
            <span className="font-bold">Одоогоор үүсгэсэн шалгалт байхгүй байна.</span>
            <button 
              type="button"
              onClick={() => {
                setNewQuizSubject(user.subject || 'Математик');
                setQuizzesView('add');
              }} 
              className="text-sm font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Анхны шалгалтаа үүсгэх үү?
            </button>
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
      {errorToast && (
        <div className="fixed top-24 right-8 z-[100] bg-red-500 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 font-bold border border-red-400 col-span-1">
          <X size={24} />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Beautiful Custom Quiz Delete Confirmation Modal */}
      {quizIdToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <X size={24} />
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-black text-slate-800">Шалгалт устгах уу?</h4>
              <p className="text-sm text-slate-500 leading-relaxed">
                Та энэ шалгалтыг устгахдаа итгэлтэй байна уу? Устгасан тохиолдолд сэргээх боломжгүй бөгөөд сурагчдын ирүүлсэн хариултууд хамт устгагдах болно.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuizIdToDelete(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Болих
              </button>
              <button
                type="button"
                onClick={() => {
                  const qId = quizIdToDelete;
                  setQuizIdToDelete(null);
                  handleDeleteQuiz(qId);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Тийм, устгах
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modern Grid Pattern & Blobs for Dashboard */}
      <div className="absolute inset-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] z-0 pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[50rem] h-[50rem] bg-fuchsia-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-blob z-0 pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[45rem] h-[45rem] bg-cyan-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000 z-0 pointer-events-none" />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <span className="text-lg sm:text-xl font-black text-slate-800 bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">Ухаалаг Сургууль</span>
            <ProfileDropdown user={user} onUpdateUser={onUpdateUser} onLogout={onLogout} />
          </div>
          
          {/* Navigation */}
          <nav className="flex space-x-4 sm:space-x-8 border-t border-slate-100 overflow-x-auto scrollbar-none whitespace-nowrap">
            {[
              { id: 'home', label: 'Нүүр' },
              { id: 'lessons', label: 'Хичээл байршуулах' },
              { id: 'assignments', label: 'Даалгавар байршуулах' },
              { id: 'attendance', label: 'Ирц бүртгэх' },
              { id: 'grades', label: 'Дүнгийн бүртгэл' },
              { id: 'quizzes', label: 'Шалгалт' },
              { id: 'chat', label: 'Чат' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === 'assignments') setAssignmentView('menu');
                  if (tab.id === 'attendance') setAttendanceView('menu');
                }}
                className={`py-4 px-2 border-b-2 font-bold transition-colors flex-shrink-0 ${
                  activeTab === tab.id 
                    ? 'border-blue-600 text-blue-600' 
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
          key={activeTab + assignmentView}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'home' && renderHome()}
          {activeTab === 'lessons' && renderLessons()}
          {activeTab === 'assignments' && renderAssignments()}
          {activeTab === 'attendance' && renderAttendance()}
          {activeTab === 'grades' && renderGrades()}
          {activeTab === 'quizzes' && renderQuizzes()}
          {activeTab === 'chat' && <ChatSystem user={user as any} />}
        </motion.div>
      </main>
    </div>
  );
}
