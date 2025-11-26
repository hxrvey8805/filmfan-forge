import { Glasses } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassesWithLensesProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const GlassesWithLenses = ({ className, ...props }: GlassesWithLensesProps) => {
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <Glasses className="relative z-10 w-full h-full" {...props} />
      {/* Yellow lens (left) */}
      <div 
        className="absolute rounded-full bg-primary opacity-75 blur-[0.5px] pointer-events-none"
        style={{ 
          left: '30%',
          top: '52%',
          width: '30%',
          height: '30%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {/* Blue lens (right) */}
      <div 
        className="absolute rounded-full bg-accent opacity-75 blur-[0.5px] pointer-events-none"
        style={{ 
          right: '30%',
          top: '52%',
          width: '30%',
          height: '30%',
          transform: 'translate(50%, -50%)',
        }}
      />
    </div>
  );
};

