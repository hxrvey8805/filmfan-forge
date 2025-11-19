import { Glasses } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassesLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

export const GlassesLogo = ({ className, style }: GlassesLogoProps) => {
  return (
    <div className={cn("relative inline-block", className)} style={style}>
      <Glasses className="w-full h-full" />
      {/* Yellow lens (left) */}
      <div 
        className="absolute top-[30%] left-[15%] w-[30%] h-[35%] rounded-full bg-yellow-400/60 mix-blend-multiply pointer-events-none"
        style={{ transform: 'rotate(-5deg)' }}
      />
      {/* Blue lens (right) */}
      <div 
        className="absolute top-[30%] right-[15%] w-[30%] h-[35%] rounded-full bg-blue-400/60 mix-blend-multiply pointer-events-none"
        style={{ transform: 'rotate(5deg)' }}
      />
    </div>
  );
};
