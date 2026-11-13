import type { ReactNode } from "react";
import { toast as show, useSonner } from "sonner";
import type { ExternalToast } from "sonner";

type Notice = Pick<ExternalToast, "action" | "description" | "duration"> & {
  title?: ReactNode;
  variant?: "default" | "success" | "destructive";
};

// Keep object-style callers and direct Sonner calls in the same notification queue.
function toast(initial: Notice) {
  let notice = initial;
  function publish(id?: string | number) {
    const { title, variant, ...options } = notice;
    const display = variant === "destructive" ? show.error : variant === "success" ? show.success : show.info;
    return display(title, { id, duration: variant === "destructive" ? 6500 : 4000, ...options });
  }
  const id = publish();
  return {
    id,
    dismiss: () => show.dismiss(id),
    update: (changes: Partial<Notice>) => {
      notice = { ...notice, ...changes };
      publish(id);
    },
  };
}

function useToast() {
  const { toasts } = useSonner();
  return { toast, toasts, dismiss: show.dismiss };
}

export { toast, useToast };
