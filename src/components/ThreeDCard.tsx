import React, { useState, useRef, MouseEvent } from 'react';

interface ThreeDCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string; // e.g., 'rgba(20, 184, 166, 0.3)' for teal, 'rgba(99, 102, 241, 0.3)' for indigo
  intensity?: number;  // Rotation intensity multiplier (default: 1)
}

export function ThreeDCard({ children, className = '', glowColor = 'rgba(99, 102, 241, 0.25)', intensity = 1 }: ThreeDCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    
    // Pixel coordinates relative to the card container
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Percentage coordinates relative to center (-0.5 to 0.5)
    const normX = (x / rect.width) - 0.5;
    const normY = (y / rect.height) - 0.5;
    
    // Convert to rotation angles (max tilt usually around 8 degrees, modified by intensity)
    const maxTilt = 8 * intensity;
    const rotateX = -normY * maxTilt;
    const rotateY = normX * maxTilt;
    
    // Translate gloss highlight coordinates (0 to 100%)
    const glossX = (x / rect.width) * 100;
    const glossY = (y / rect.height) * 100;

    setCoords({ x: glossX, y: glossY });
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotate({ x: 0, y: 0 });
  };

  // Build responsive shadow offsets matching rotation direction (depth illusion)
  const shadowX = -rotate.y * 1.5;
  const shadowY = rotate.x * 1.5;
  
  const style: React.CSSProperties = {
    transform: `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) scale3d(${isHovered ? 1.025 : 1}, ${isHovered ? 1.025 : 1}, 1)`,
    transition: isHovered ? 'transform 0.05s ease-out, box-shadow 0.05s ease-out' : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
    transformStyle: 'preserve-3d',
    boxShadow: isHovered
      ? `${shadowX}px ${shadowY}px 35px -5px ${glowColor}, 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)`
      : '0 10px 25px -5px rgba(0, 0, 0, 0.02), 0 8px 10px -6px rgba(0, 0, 0, 0.02)',
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Gloss overlay highlight */}
      <div
        className="absolute inset-0 pointer-events-none z-30 transition-opacity duration-300 pointer-events-none"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(circle 180px at ${coords.x}% ${coords.y}%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.03) 50%, transparent 100%)`,
        }}
      />
      
      {/* Highlight glow ring */}
      <div
        className="absolute inset-0 pointer-events-none z-20 transition-opacity duration-300 border border-white/20 rounded-[inherit]"
        style={{
          opacity: isHovered ? 1 : 0.4,
        }}
      />

      {/* Actual Inner Content */}
      <div className="h-full w-full [transform-style:preserve-3d]">
        {children}
      </div>
    </div>
  );
}
