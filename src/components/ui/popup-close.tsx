import * as React from 'react';
import {X} from 'lucide-react';
import {cn} from '@/lib/utils';
import './popup-close.css';

// A quiet 32px visual inside a full 44px touch target. Radix Close can use
// this asChild, preserving its Escape, focus-return and dismissal behaviour.
export const PopupClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({className, 'aria-label': label = 'Close', ...props}, ref) => (
    <button {...props} ref={ref} type="button" aria-label={label} data-popup-close className={cn('popup-close',className)}>
      <X size={18} strokeWidth={1.8} aria-hidden="true"/>
    </button>
  ),
);
PopupClose.displayName='PopupClose';
