import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, deleteDoc, writeBatch, limit } from 'firebase/firestore';
import { Mail, Search, Inbox, Trash2, X, Check, Copy, RefreshCw, Layers, ExternalLink, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface SimulatedEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  code: string;
  username: string;
  createdAt: string;
  read?: boolean;
}

interface GmailSimulatorProps {
  initialEmail?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function GmailSimulator({ initialEmail = '', isOpen = false, onClose }: GmailSimulatorProps) {
  const [emailAddress, setEmailAddress] = useState(initialEmail || '');
  const [emails, setEmails] = useState<SimulatedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SimulatedEmail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'inbox' | 'updates' | 'spam'>('inbox');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Sync internal email state with initialEmail prop changes
  useEffect(() => {
    if (initialEmail) {
      setEmailAddress(initialEmail.trim().toLowerCase());
    }
  }, [initialEmail]);

  // Real-time listener for emails sent to target address from Firestore
  useEffect(() => {
    if (!emailAddress.trim()) {
      setEmails([]);
      return;
    }

    setIsLoading(true);
    const targetEmail = emailAddress.trim().toLowerCase();
    
    // Query emails for this recipient
    const q = query(
      collection(db, 'emails'),
      where('to', '==', targetEmail)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: SimulatedEmail[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetched.push({
          id: doc.id,
          to: data.to || '',
          from: data.from || '',
          subject: data.subject || '',
          code: data.code || '',
          username: data.username || '',
          createdAt: data.createdAt || new Date().toISOString(),
          read: data.read || false,
        });
      });

      // Sort by date descending client-side (to avoid index requirement issues if user has raw Firestore)
      fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setEmails(fetched);
      setIsLoading(false);
    }, (err) => {
      console.error("Error reading simulated emails:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [emailAddress]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleMarkAsRead = async (email: SimulatedEmail) => {
    setSelectedEmail(email);
    if (!email.read) {
      try {
        await updateDoc(doc(db, 'emails', email.id), { read: true });
      } catch (err) {
        console.error("Could not mark as read in firestore", err);
      }
    }
  };

  const handleDeleteEmail = async (emailId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'emails', emailId));
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }
      setSuccessMsg("Имэйл амжилттай устгагдлаа.");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error("Could not delete email", err);
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm("Энэ хаяг дээрх бүх имэйлийг устгах уу?")) {
      try {
        const batchSize = 100;
        emails.forEach(async (mail) => {
          await deleteDoc(doc(db, 'emails', mail.id));
        });
        setSelectedEmail(null);
        setSuccessMsg("Бүх имэйлүүд цэвэрлэгдлээ.");
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err) {
        console.error("Delete all failed", err);
      }
    }
  };

  const filteredEmails = emails.filter(mail => {
    const searchLower = searchQuery.toLowerCase();
    return (
      mail.subject.toLowerCase().includes(searchLower) ||
      mail.code.toLowerCase().includes(searchLower) ||
      mail.from.toLowerCase().includes(searchLower) ||
      mail.username.toLowerCase().includes(searchLower)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#f6f8fc] w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Gmail Window Header */}
        <div className="bg-[#ffffff] px-6 py-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2">
            {/* Google Logo / App Visual Marker */}
            <div className="w-9 h-9 flex-shrink-0 bg-red-50 rounded-lg flex items-center justify-center border border-red-100 shadow-sm">
              <svg className="w-5 h-5 animate-pulse" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
                <path d="M22 6V18C22 19.1 21.1 20 20 20H17V9L22 6Z" fill="#34A853" />
                <path d="M2 6V18C2 19.1 2.9 20 4 20H7V9L2 6Z" fill="#4285F4" />
                <path d="M12 13L21.4 6.8C21.8 6.5 22 6 22 5.5C22 4.4 20.9 3.5 19.8 3.5H4.2C3.1 3.5 2 4.4 2 5.5C2 6 2.2 6.5 2.6 6.8L12 13Z" fill="#EA4335" />
              </svg>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 leading-none">
                Google Mail Simulator
                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold border border-red-100">Симуляци</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Вэб доторх Gmail шууданг хянах боломжтой</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onClose && (
              <button 
                onClick={onClose} 
                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full cursor-pointer transition-colors"
                id="btn_close_gmail"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Gmail Search / Address Selection */}
        <div className="bg-white p-4 sm:px-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex-1 max-w-md">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Gmail хаяг оруулах:</label>
            <div className="relative">
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => {
                  setEmailAddress(e.target.value.toLowerCase());
                  setSelectedEmail(null);
                }}
                className="w-full pl-4 pr-12 py-2.5 bg-slate-100 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all outline-none font-bold text-slate-800 placeholder:text-slate-400"
                placeholder="Жишээ: chuuslychou@gmail.com"
                id="input_gmail_simulation_address"
              />
              <div className="absolute right-3.5 top-3 text-slate-400">
                <Search size={18} />
              </div>
            </div>
          </div>

          {emailAddress.trim() && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100/50 rounded-2xl p-3 text-xs font-semibold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              <span>Хаяг: <b>{emailAddress}</b> сувгийг шууд хянаж байна</span>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Side navigation rail */}
          <div className="hidden sm:flex flex-col w-52 bg-white border-r border-slate-200 p-3 justify-between">
            <div className="space-y-1">
              <button 
                onClick={() => setActiveTab('inbox')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${activeTab === 'inbox' ? 'bg-red-50 text-red-600' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <span className="flex items-center gap-2">
                  <Inbox size={15} /> Ирсэн имэйл
                </span>
                {emails.filter(e => !e.read).length > 0 && (
                  <span className="bg-red-500 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded-full">
                    {emails.filter(e => !e.read).length}
                  </span>
                )}
              </button>

              <button 
                onClick={() => setActiveTab('updates')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer ${activeTab === 'updates' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                <span className="flex items-center gap-2">
                  <Layers size={14} /> Мэдэгдэл
                </span>
              </button>
            </div>

            <div className="border-t border-slate-100 pt-3">
              {emails.length > 0 && (
                <button 
                  onClick={handleDeleteAll}
                  className="w-full flex items-center justify-center gap-1.5 py-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
                >
                  <Trash2 size={13} /> Бүгдийг цэвэрлэх
                </button>
              )}
            </div>
          </div>

          {/* Email View Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* List of received Simulated Emails */}
            <div className={`w-full ${selectedEmail ? 'hidden md:block md:w-2/5' : 'w-full'} bg-white flex flex-col border-r border-slate-200 overflow-y-auto`}>
              {/* Toolbar in list */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Хайх..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-slate-300"
                  />
                  <div className="absolute left-2.5 top-2.5 text-slate-400">
                    <Search size={14} />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setIsLoading(true);
                    setTimeout(() => setIsLoading(false), 500);
                  }}
                  className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  title="Шинэчлэх"
                >
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Message Feed List */}
              {isLoading && emails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <RefreshCw size={24} className="text-red-500 animate-spin mb-3" />
                  <p className="text-xs font-bold text-slate-500">Шуудан ачааллаж байна...</p>
                </div>
              ) : !emailAddress.trim() ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                    <Mail size={32} />
                  </div>
                  <h4 className="font-bold text-slate-700 text-sm">Gmail хаягаа оруулна уу</h4>
                  <p className="text-xs text-slate-500 max-w-xs mt-1">
                    Сургуулийн код сэргээж буй Gmail хаягаа дээрх талбарт оруулахад ирсэн баталгаажуулах имэйл одоо цагаар шууд харагдах болно.
                  </p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                  <div className="w-14 h-14 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-4 text-orange-400">
                    <Inbox size={26} />
                  </div>
                  <h4 className="font-bold text-slate-700 text-sm">Имэйл хоосон байна</h4>
                  <p className="text-xs text-slate-500 max-w-xs mt-1.5 leading-relaxed">
                    Хаяг: <b>{emailAddress}</b><br/>
                    Одоогоор ирсэн баталгаажуулах имэйл алга байна! Системээс нууц код сэргээх хүсэлт илгээнэ үү.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredEmails.map((mail) => (
                    <div
                      key={mail.id}
                      onClick={() => handleMarkAsRead(mail)}
                      className={`p-4 flex flex-col gap-1 hover:bg-slate-50 cursor-pointer transition-colors relative ${selectedEmail?.id === mail.id ? 'bg-red-50/30 border-l-4 border-red-500' : ''} ${!mail.read ? 'font-bold bg-white' : 'text-slate-600'}`}
                    >
                      {/* Unread blue dot */}
                      {!mail.read && (
                        <div className="absolute left-1 top-5 w-2 h-2 rounded-full bg-blue-500" />
                      )}
                      
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
                          {mail.from.split('<')[0].replace(/"/g, '') || mail.from}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(mail.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      
                      <h5 className="text-xs font-semibold text-slate-800 truncate">
                        {mail.subject}
                      </h5>
                      
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        Хамгаалалтын код: {mail.code} / Нэвтрэх нэр: {mail.username}
                      </p>

                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-50">
                        <span className="text-[9px] bg-red-100/50 text-red-600 font-bold px-1.5 py-0.5 rounded-full">
                          Код: {mail.code}
                        </span>
                        <button 
                          onClick={(e) => handleDeleteEmail(mail.id, e)}
                          className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-colors"
                          title="Устгах"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Detail Panel */}
            <div className={`flex-1 flex flex-col ${selectedEmail ? 'w-full' : 'hidden md:flex bg-slate-50/30'} bg-white overflow-y-auto`}>
              {selectedEmail ? (
                <div className="flex-1 flex flex-col h-full bg-white">
                  {/* Detail Panel Actions Header */}
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <button 
                      onClick={() => setSelectedEmail(null)}
                      className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft size={14} /> Буцах
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={() => handleDeleteEmail(selectedEmail.id)}
                        className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-500 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      >
                        <Trash2 size={13} /> Устгах
                      </button>
                    </div>
                  </div>

                  {/* Complete email body inside mock client */}
                  <div className="p-6 flex-1 overflow-y-auto">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-3">
                      {selectedEmail.subject}
                    </h2>

                    {/* Sender, Date, Recipient Header */}
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-sm">Ухаалаг Сургууль холбоо</span>
                          <span className="text-xs text-slate-400 font-semibold">&lt;noreply@school.mn&gt;</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          хэнд: <strong className="text-slate-700 font-semibold">{selectedEmail.to}</strong>
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {new Date(selectedEmail.createdAt).toLocaleDateString()} {new Date(selectedEmail.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Google Mail Sandbox Style Email Layout Frame */}
                    <div className="bg-[#ffffff] border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-w-xl mx-auto">
                      <div className="text-center border-b-2 border-slate-100 pb-5 mb-5">
                        <span className="text-[18px] font-black text-indigo-600 tracking-tight">🏫 УХААЛАГ СУРГУУЛЬ</span>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Нэвтрэх эрх сэргээх</p>
                      </div>

                      <div className="text-slate-700 space-y-4 text-xs leading-relaxed font-medium">
                        <p>Сайн байна уу, хүндэт <strong className="text-slate-900 font-bold">{selectedEmail.username}</strong>,</p>
                        <p>Таны "Ухаалаг Сургууль" системд бүртгэлтэй хамгаалалтын код амжилттай үүслээ. Доорх нэг удаа ашиглах баталгаажуулах кодыг ашиглана уу.</p>
                        
                        <div className="text-center py-6">
                          <div className="inline-block bg-indigo-50/70 border-2 border-dashed border-indigo-200 px-6 py-4 rounded-2xl relative group">
                            <span className="font-mono font-black text-3xl text-indigo-600 block tracking-widest">{selectedEmail.code}</span>
                            <button
                              onClick={() => handleCopyCode(selectedEmail.code)}
                              className="absolute -right-2 -bottom-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl border border-white shadow-md flex items-center justify-center transition-colors hover:scale-105 cursor-pointer"
                              title="Код хуулах"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                          {copiedCode && (
                            <p className="text-[11px] text-emerald-600 font-bold mt-2 font-sans animate-bounce">✓ Амжилттай хуулагдлаа!</p>
                          )}
                        </div>

                        <p className="p-3 bg-red-50 text-red-600 rounded-xl font-bold text-[11px]">
                          ⚠️ Санамж: Энэхүү код нь зөвхөн 15 минутын хугацаанд хүчинтэй байна. Хэрэв та нууц үг сэргээх хүсэлт илгээгээгүй бол энэхүү имэйлийг үл тоомсорлоорой.
                        </p>
                      </div>

                      <div className="border-t border-slate-100 mt-6 pt-4 text-center text-[10px] text-slate-400">
                        <p className="font-bold">Ухаалаг Сургууль Холбооны Систем</p>
                        <p className="mt-0.5">Энэ имэйл нь автоматаар үүсгэгдсэн тул хариу бичихгүй байхыг хүсье.</p>
                      </div>
                    </div>

                    {/* Quick helper buttons */}
                    <div className="mt-6 flex justify-center gap-3">
                      <button 
                        onClick={() => handleCopyCode(selectedEmail.code)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow"
                      >
                        <Copy size={13} /> Хамгаалалтын код хуулах
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/20">
                    <Mail size={40} className="text-slate-300 mb-2 animate-bounce" />
                    <h4 className="font-bold text-slate-600 text-xs">Имэйл сонгоно уу</h4>
                    <p className="text-[11px] text-slate-400 max-w-xs mt-1">Зүүн талын жагсаалтаас имэйл дээр дарж бүрэн эхээр нь харна уу.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Status bar */}
        <div className="bg-white border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-[11px] text-slate-400 font-semibold select-none">
          <span>Холболт: <b className="text-emerald-500 font-bold">● Идэвхтэй</b></span>
          <span>Жинхэнэ Gmail хайрцаг шиг бүрэн ажиллана</span>
        </div>
      </motion.div>
    </div>
  );
}

// Reusable micro button to trigger Google Mail Simulator anywhere
interface GmailSimulatorTriggerProps {
  onClick: () => void;
  unreadCount?: number;
}

export function GmailSimulatorTrigger({ onClick, unreadCount = 0 }: GmailSimulatorTriggerProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-5 py-4 rounded-2xl shadow-xl flex items-center gap-3 border border-red-400/20 group cursor-pointer"
      id="gmail_simulation_floating_trigger"
    >
      <div className="relative">
        <svg className="w-6 h-6 transition-transform group-hover:rotate-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
          <path d="M22 6V18C22 19.1 21.1 20 20 20H17V9L22 6Z" fill="#34A853" />
          <path d="M2 6V18C2 19.1 2.9 20 4 20H7V9L2 6Z" fill="#4285F4" />
          <path d="M12 13L21.4 6.8C21.8 6.5 22 6 22 5.5C22 4.4 20.9 3.5 19.8 3.5H4.2C3.1 3.5 2 4.4 2 5.5C2 6 2.2 6.5 2.6 6.8L12 13Z" fill="#EA4335" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-yellow-500 text-slate-950 font-black text-[9px] rounded-full flex items-center justify-center animate-bounce border border-white">
            {unreadCount}
          </span>
        )}
      </div>
      <div className="text-left font-sans">
        <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider leading-none mb-0.5">Google Mail</p>
        <p className="text-xs font-extrabold leading-none">Шуудан Simulator</p>
      </div>
    </motion.button>
  );
}
