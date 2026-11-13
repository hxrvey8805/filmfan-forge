import { useId, useRef, useState } from "react";
import { Check, ChevronRight, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { defaultRoomStyle, roomStyleKeys, roomStyles, type RoomStyle } from "@/lib/room-styles";

// A small empty set previews each palette without rendering extra animated Geeks.
function RoomMiniature() {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 100 53" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id}><stop stopColor="var(--room-shadow)" /><stop offset=".65" stopColor="var(--room-wall)" /><stop offset="1" stopColor="var(--room-lit-wall)" /></linearGradient>
    </defs>
    <rect width="100" height="53" fill={`url(#${id})`}/>
    <path d="M0 40 100 33v20H0Z" fill="var(--room-floor)"/>
    <ellipse cx="59" cy="45" rx="32" ry="5.5" fill="var(--room-rug)" stroke="var(--room-weave)" strokeWidth=".65"/>
    <path d="M0 0h20v40L0 42Z" fill="var(--room-timber)"/>
    <path d="M2 11h16M2 24h16M2 36h16M19 0v39" stroke="var(--room-wood-edge)" strokeWidth="2"/>
    <path d="M4 4v5m4-6v7m4-5v4m-7 7v6m6-7v6" stroke="var(--room-accent)" strokeWidth="2" opacity=".55"/>
    <path d="M37 4h9v12h-9Zm13 1h7v8h-7Z" fill="var(--room-shadow)" stroke="var(--room-weave)" strokeWidth="1.2"/>
    <circle cx="41.5" cy="9" r="2" fill="#f4b66a"/>
    <path d="M85 16v22m-3 1h6" stroke="var(--room-weave)" strokeWidth="1.4"/>
    <path d="m81 11 8-.5 3 9q-6 2-13 0Z" fill="var(--room-lamplight)"/>
    <path d="m41 42-1 3m25-4v3" stroke="#332027" strokeWidth="2"/>
    <path d="M39 33q-2-12 3-15 6-4 16-2 7 1 8 8l1 10Z" fill="#a73e41" stroke="#51262f" strokeWidth="1.4"/>
    <path d="M40 28q-1-9 5-11 11-4 16 1" fill="none" stroke="#edb77d" strokeWidth=".85"/>
    <path d="M36 30q2-3 5-1l4 5 17-2 4-5q4-2 6 1l-1 10-6 4-22 2-7-5Z" fill="#a43a40" stroke="#51262f" strokeWidth="1.3"/>
    <path d="m44 35 18-2 3 3-20 3Z" fill="#d66156"/>
    <path d="m66 29 3-1-2 9-3 1Z" fill="#efbf89"/>
  </svg>;
}

export function RoomStylePicker({ value, choose, ready }: {
  value: RoomStyle; choose: (style: RoomStyle) => void; ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const current = useRef<HTMLButtonElement>(null);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="room-style-trigger" disabled={!ready}
        aria-label={`Room style: ${roomStyles[value].name}`}>
        <Palette size={17} aria-hidden="true" />Room style <span>{roomStyles[value].name}</span><ChevronRight size={15} aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" collisionPadding={12} sideOffset={6} className="room-style-picker"
      aria-labelledby={titleId} onOpenAutoFocus={event => {
        event.preventDefault();
        current.current?.focus({ preventScroll: true });
      }}>
      <h3 id={titleId}>Choose your room style</h3>
      <div className="room-style-grid">
        {roomStyleKeys.map(key => <button key={key} type="button" className="room-style-tile"
          ref={key === value ? current : undefined} style={roomStyles[key].paint} aria-pressed={key === value}
          onClick={() => { choose(key); setOpen(false); }}>
          <span className="room-style-picture"><RoomMiniature />
            {key === value && <span className="room-style-tick"><Check size={11} strokeWidth={3} /></span>}
          </span>
          <span>{roomStyles[key].name}{key === defaultRoomStyle && <small className="room-style-default">Default</small>}</span>
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
