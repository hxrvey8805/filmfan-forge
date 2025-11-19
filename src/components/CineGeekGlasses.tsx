import React from "react";

interface CineGeekGlassesProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Custom CineGeek branded glasses icon with yellow left lens and blue right lens
 * Drop-in replacement for lucide-react Glasses icon with two-toned theme colors
 */
export const CineGeekGlasses = React.forwardRef<SVGSVGElement, CineGeekGlassesProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "", ...props }, ref) => {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
      >
        {/* Left Lens - Yellow (Primary) */}
        <circle 
          cx="6" 
          cy="15" 
          r="4" 
          fill="hsl(45 100% 51%)"
          fillOpacity="1"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        
        {/* Right Lens - Blue (Accent) */}
        <circle 
          cx="18" 
          cy="15" 
          r="4" 
          fill="hsl(189 100% 56%)"
          fillOpacity="1"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        
        {/* Bridge */}
        <path d="M10 15h4" />
        
        {/* Left Temple */}
        <path d="M2 15s1-3 4-3" />
        
        {/* Right Temple */}
        <path d="M22 15s-1-3-4-3" />
      </svg>
    );
  }
);

CineGeekGlasses.displayName = "CineGeekGlasses";

export default CineGeekGlasses;
