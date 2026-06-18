import { GraduationCap, Presentation } from 'lucide-react';
import { RoleCard } from './RoleCard';
import { motion } from 'motion/react';

interface RoleSelectionProps {
  onSelectRole: (role: 'teacher' | 'student') => void;
}

export function RoleSelection({ onSelectRole }: RoleSelectionProps) {
  return (
    <div className="flex flex-col md:flex-row gap-8 justify-center items-stretch w-full max-w-5xl mx-auto px-6">
      <motion.div 
        className="flex-1 flex justify-center"
        initial={{ x: -120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
      >
        <RoleCard
          title="Багш"
          description="Хичээл удирдах, сурагчдын явцыг хянах"
          icon={<Presentation size={56} className="text-white" strokeWidth={1.5} />}
          gradientClass="bg-gradient-to-br from-blue-500 to-indigo-600"
          onClick={() => onSelectRole('teacher')}
        />
      </motion.div>
      <motion.div 
        className="flex-1 flex justify-center"
        initial={{ x: 120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1.1, type: "spring", bounce: 0.25 }}
      >
        <RoleCard
          title="Сурагч"
          description="Хичээл үзэх, даалгавар гүйцэтгэх"
          icon={<GraduationCap size={56} className="text-white" strokeWidth={1.5} />}
          gradientClass="bg-gradient-to-br from-emerald-400 to-teal-600"
          onClick={() => onSelectRole('student')}
        />
      </motion.div>
    </div>
  );
}
