import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, CheckCircle2, X, RefreshCw, Key, ArrowRight } from 'lucide-react';
import { UserData } from './LoginForm';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, getDoc, 
  setDoc, deleteDoc, updateDoc, getDocs, writeBatch 
} from 'firebase/firestore';

interface AdminRequestPromptProps {
  user: UserData;
  onUpdateUser: (user: UserData) => void;
}

export function AdminRequestPrompt({ user, onUpdateUser }: AdminRequestPromptProps) {
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const currentKey = `${user.schoolCode}_${user.role}_${user.username}`;

  useEffect(() => {
    // Query pending change requests representing THIS user
    const q = query(
      collection(db, 'admin_requests'),
      where('userKey', '==', currentKey),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setPendingRequests(docs);
    }, (error) => {
      console.error("Error monitoring admin requests:", error);
      handleFirestoreError(error, OperationType.GET, 'admin_requests');
    });

    return () => unsubscribe();
  }, [currentKey]);

  const handleApprove = async (req: any) => {
    setIsProcessing(true);
    setSuccessMsg('');
    const oldUserKey = currentKey;
    const newUserKey = `${user.schoolCode}_${user.role}_${req.requestedUsername}`;

    try {
      // 1. Get current user data
      const oldUserRef = doc(db, 'users', oldUserKey);
      const userSnap = await getDoc(oldUserRef).catch(err => {
        handleFirestoreError(err, OperationType.GET, `users/${oldUserKey}`);
      });

      if (userSnap && userSnap.exists()) {
        const userData = userSnap.data();

        // 2. Prepare updated user credentials object
        const updatedUserData = {
          ...userData,
          username: req.requestedUsername,
          password: req.requestedPassword
        };

        // 3. Set new user document in Firestore
        await setDoc(doc(db, 'users', newUserKey), updatedUserData).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `users/${newUserKey}`);
        });

        // 4. If the username actually changed, delete the old document
        if (oldUserKey !== newUserKey) {
          await deleteDoc(oldUserRef).catch(err => {
            handleFirestoreError(err, OperationType.DELETE, `users/${oldUserKey}`);
          });

          // 5. AUTO-MIGRATE user relational data (UUR GOY YM)
          // If student: update 'studentUsername' to requestedUsername in 'grades' collection
          if (user.role === 'student') {
            const gradesQuery = query(
              collection(db, 'grades'),
              where('studentUsername', '==', user.username)
            );
            const gradesSnap = await getDocs(gradesQuery).catch(err => {
              handleFirestoreError(err, OperationType.GET, 'grades');
            });
            if (gradesSnap && !gradesSnap.empty) {
              const batch = writeBatch(db);
              gradesSnap.docs.forEach((docRef) => {
                batch.update(docRef.ref, { studentUsername: req.requestedUsername });
              });
              await batch.commit().catch(err => {
                handleFirestoreError(err, OperationType.WRITE, 'grades/batch');
              });
            }
          }

          // If teacher: update 'teacher' to requestedUsername in 'lessons' and 'assignments' collections
          if (user.role === 'teacher') {
            // Lessons migration
            const lessonsQuery = query(
              collection(db, 'lessons'),
              where('teacher', '==', user.username)
            );
            const lessonsSnap = await getDocs(lessonsQuery).catch(err => {
              handleFirestoreError(err, OperationType.GET, 'lessons');
            });
            if (lessonsSnap && !lessonsSnap.empty) {
              const batch = writeBatch(db);
              lessonsSnap.docs.forEach((docRef) => {
                batch.update(docRef.ref, { teacher: req.requestedUsername });
              });
              await batch.commit().catch(err => {
                handleFirestoreError(err, OperationType.WRITE, 'lessons/batch');
              });
            }

            // Assignments migration
            const assignmentsQuery = query(
              collection(db, 'assignments'),
              where('teacher', '==', user.username)
            );
            const assignmentsSnap = await getDocs(assignmentsQuery).catch(err => {
              handleFirestoreError(err, OperationType.GET, 'assignments');
            });
            if (assignmentsSnap && !assignmentsSnap.empty) {
              const batch = writeBatch(db);
              assignmentsSnap.docs.forEach((docRef) => {
                batch.update(docRef.ref, { teacher: req.requestedUsername });
              });
              await batch.commit().catch(err => {
                handleFirestoreError(err, OperationType.WRITE, 'assignments/batch');
              });
            }
          }
        }

        // 6. Update the admin request state to 'approved'
        await updateDoc(doc(db, 'admin_requests', req.id), { status: 'approved' }).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `admin_requests/${req.id}`);
        });

        setSuccessMsg('Таны нэвтрэх мэдээлэл амжилттай солигдлоо! Кабинет шинэчлэгдэж байна.');
        
        // 7. Trigger the app callback to immediately update the local storage & session
        setTimeout(() => {
          onUpdateUser({
            ...user,
            username: req.requestedUsername,
            password: req.requestedPassword
          });
          setIsProcessing(false);
          setSuccessMsg('');
        }, 3000);
      }
    } catch (err) {
      console.error("Failed to approve credential changes:", err);
      alert("Шинэчлэлийг хадгалахад алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.");
      setIsProcessing(false);
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleReject = async (req: any) => {
    setIsProcessing(true);
    try {
      // Set database state to rejected
      await updateDoc(doc(db, 'admin_requests', req.id), { status: 'rejected' }).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `admin_requests/${req.id}`);
      });
    } catch (err) {
      console.error("Error rejecting credentials change:", err);
      handleFirestoreError(err, OperationType.WRITE, `admin_requests/${req.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (pendingRequests.length === 0) return null;

  // Render the oldest pending request first
  const req = pendingRequests[0];

  const usernameChanged = req.currentUsername !== req.requestedUsername;
  const passwordChanged = req.currentPassword !== req.requestedPassword;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-lg w-full p-6 sm:p-9 relative overflow-hidden animate-in">
        
        {/* Floating gradient circle */}
        <div className="absolute top-[-30%] left-[-20%] w-[350px] h-[350px] bg-amber-500/10 rounded-full filter blur-[50px] pointer-events-none" />

        <div className="text-center space-y-4 mb-8">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <ShieldAlert size={28} className="animate-bounce" />
          </div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Админы Хүсэлт: Мэдээлэл шинэчлэх</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            Сайн байна уу? Сургуулийн системийн дээд админы зүгээс таны нэвтрэх нэр эсвэл нууц үгийг солих хүсэлт илгээсэн байна. Та зөвшөөрөл өгнө үү?
          </p>
        </div>

        {successMsg ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={22} className="animate-pulse" />
            </div>
            <p className="text-emerald-700 text-sm font-bold">{successMsg}</p>
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          </div>
        ) : (
          <div className="space-y-5">
            
            {/* Comparison Table */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-sm">
              
              {/* Username row */}
              <div className="p-4 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Нэвтрэх нэр</span>
                  <span className="text-xs font-bold text-slate-500 mt-1">Одоо: @{user.username}</span>
                </div>
                {usernameChanged ? (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl">
                    <ArrowRight size={14} className="text-indigo-500" />
                    <span className="text-xs font-black text-indigo-700">@{req.requestedUsername}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 font-bold">Өөрчлөгдөөгүй</span>
                )}
              </div>

              {/* Password row */}
              <div className="p-4 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Нэвтрэх нууц үг</span>
                  <span className="text-xs font-bold text-slate-500 mt-1">Одоо: {user.password}</span>
                </div>
                {passwordChanged ? (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl">
                    <ArrowRight size={14} className="text-indigo-500" />
                    <span className="text-xs font-black text-indigo-700">{req.requestedPassword}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 font-bold">Өөрчлөгдөөгүй</span>
                )}
              </div>

            </div>

            {/* Note text */}
            <p className="text-[10px] text-amber-600 font-bold bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-100">
              ⚠️ Санамж: Та "Зөвшөөрөх" дээр дарснаар таны бүртгэл шинэчлэгдэж, та дараагийн удаа шинэ мэдээллээрээ нэвтрэх шаардлагатай болно.
            </p>

            {/* Actions buttons */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => handleReject(req)}
                disabled={isProcessing}
                className="flex-1 py-3.5 border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
              >
                Татгалзах (Reject)
              </button>
              <button
                onClick={() => handleApprove(req)}
                disabled={isProcessing}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-75 text-white font-bold rounded-2xl text-xs transition-colors cursor-pointer shadow-lg flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <RefreshCw className="animate-spin text-white" size={14} />
                ) : (
                  <Key size={14} />
                )}
                Тийм, зөвшөөрч байна
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
