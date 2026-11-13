import type { SVGProps } from "react";
import { Glasses } from "lucide-react";
import { cn } from "@/lib/utils";

// The logo and the mascot use the same round rims, bridge and tinted lenses.
export function CineGeekFrames({ children, frontOnly = false, ...props }: SVGProps<SVGSVGElement> & { frontOnly?: boolean }) {
  const lenses = <>
    <circle cx="6" cy="15" r="3" fill="hsl(150 70% 65%)" stroke="none" />
    <circle cx="18" cy="15" r="3" fill="hsl(var(--accent))" stroke="none" />
    {children}
  </>;
  if (frontOnly) {
    // In the worn pose the temples sit in a separate layer beneath the hair.
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <circle cx="6" cy="15" r="4" /><circle cx="18" cy="15" r="4" />
      <path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      {lenses}
    </svg>;
  }
  return <Glasses {...props}>{lenses}</Glasses>;
}

export function GlassesWithLenses({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <div className={cn("relative inline-flex items-center justify-center", className)}>
    <CineGeekFrames className="w-full h-full" {...props} />
  </div>;
}
