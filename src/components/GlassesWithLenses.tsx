import { Glasses } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassesWithLensesProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const GlassesWithLenses = ({ className, ...props }: GlassesWithLensesProps) => {
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <Glasses className="relative z-10 w-full h-full" {...props} />
      {/* Green lens (left) - matches CineGeek gradient middle color (faded yellow to blue) */}
      <div 
        className="absolute rounded-full opacity-75 blur-[0.5px] pointer-events-none"
        style={{ 
          left: '25%',
          top: '61%',
          width: '30%',
          height: '30%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'hsl(120 85% 53%)', // Faded green-cyan from yellow-to-blue gradient
        }}
      />
      {/* Blue lens (right) */}
      <div 
        className="absolute rounded-full bg-accent opacity-75 blur-[0.5px] pointer-events-none"
        style={{ 
          right: '25%',
          top: '61%',
          width: '30%',
          height: '30%',
          transform: 'translate(50%, -50%)',
        }}
      />
    </div>
  );
};

