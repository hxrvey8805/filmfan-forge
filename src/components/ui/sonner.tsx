import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";
import "./notifications.css";

const offset = { bottom: "var(--notice-bottom)", left: 16, right: 16 };

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      visibleToasts={1}
      duration={4000}
      offset={offset}
      mobileOffset={offset}
      icons={{ success: <CircleCheck />, error: <CircleAlert />, info: <Info /> }}
      toastOptions={{ className: "cine-notice" }}
      {...props}
    />
  );
}

export { Toaster, toast };
