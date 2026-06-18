import { ReactNode } from 'react';
import { ThreeDCard } from './ThreeDCard';

interface RoleCardProps {
  title: string;
  icon: ReactNode;
  description?: string;
  onClick: () => void;
  gradientClass: string;
}

export function RoleCard({ title, icon, description, onClick, gradientClass }: RoleCardProps) {
  const isTeacher = gradientClass.includes('blue') || gradientClass.includes('indigo') || title.includes('Багш');
  const glowCol = isTeacher ? 'rgba(99, 102, 241, 0.45)' : 'rgba(13, 148, 136, 0.45)';

  return (
    <ThreeDCard
      className={`rounded-3xl w-full max-w-sm cursor-pointer shadow-xl transition-all duration-300 ${gradientClass}`}
      intensity={1.25}
      glowColor={glowCol}
    >
      <button
        onClick={onClick}
        type="button"
        className="relative overflow-hidden flex flex-col items-center justify-center p-10 w-full text-center group text-white h-full cursor-pointer focus:outline-none"
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="mb-6 p-5 bg-white/20 rounded-2xl backdrop-blur-sm shadow-inner transition-transform duration-300 group-hover:scale-110 [transform:translateZ(20px)]">
          {icon}
        </div>
        <h2 className="text-3xl font-black mb-3 text-white tracking-wide [transform:translateZ(30px)]">{title}</h2>
        {description && (
          <p className="text-base text-white/90 text-center font-medium leading-relaxed [transform:translateZ(10px)]">
            {description}
          </p>
        )}
      </button>
    </ThreeDCard>
  );
}

