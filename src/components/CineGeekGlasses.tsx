import React from 'react';

interface CineGeekGlassesProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const CineGeekGlasses: React.FC<CineGeekGlassesProps> = ({ 
  size = 24, 
  strokeWidth = 2,
  className = "",
  ...props 
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Left lens - Yellow */}
      <circle 
        cx="6" 
        cy="15" 
        r="4" 
        fill="hsl(45 100% 51%)" 
        fillOpacity="0.7"
        stroke="currentColor"
      />
      
      {/* Right lens - Blue */}
      <circle 
        cx="18" 
        cy="15" 
        r="4" 
        fill="hsl(189 100% 56%)" 
        fillOpacity="0.7"
        stroke="currentColor"
      />
      
      {/* Bridge */}
      <path d="M10 15h4" />
      
      {/* Left arm */}
      <path d="M2 15s1-4 4-4" />
      
      {/* Right arm */}
      <path d="M22 15s-1-4-4-4" />
    </svg>
  );
};
