import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { formatTimestamp, parseTimestamp } from '../../supabase/functions/_shared/companion';

export function CompanionTimestamp({ minutes, maxMinutes, onChange, onValidityChange, disabled = false }: {
  minutes: number; maxMinutes: number; onChange: (minutes: number[]) => void;
  onValidityChange: (valid: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  const seconds = Math.round(minutes * 60);
  const [value, setValue] = useState(formatTimestamp(seconds));
  const parsedValue = parseTimestamp(value);
  const invalid = parsedValue === null || parsedValue > maxMinutes * 60;
  useEffect(() => { setValue(formatTimestamp(seconds)); }, [seconds]);
  useEffect(() => { onValidityChange(!invalid); }, [invalid, onValidityChange]);
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium">Your position</label>
      <Input id={id} className="w-36 font-mono text-primary" aria-invalid={invalid}
        aria-describedby={`${id}-hint`} placeholder="HH:MM:SS" value={value} disabled={disabled}
        onChange={event => {
          const text = event.target.value; setValue(text);
          const parsed = parseTimestamp(text);
          const valid = parsed !== null && parsed <= maxMinutes * 60;
          onValidityChange(valid);
          if (valid) onChange([parsed! / 60]);
        }} />
    </div>
    <Slider value={[seconds]} min={0} max={Math.floor(maxMinutes * 60)} step={1} disabled={disabled}
      aria-label="Viewing position in seconds" onValueChange={([next]) => {
        setValue(formatTimestamp(next)); onValidityChange(true); onChange([next / 60]);
      }} />
    <p id={`${id}-hint`} className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
      {invalid ? `Enter MM:SS or HH:MM:SS, up to ${formatTimestamp(maxMinutes * 60)}.`
        : `Answers and conversation stay within ${formatTimestamp(seconds)}. Update this when you move forward or rewind.`}
    </p>
  </div>;
}
