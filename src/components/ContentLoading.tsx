import { LoaderCircle } from "lucide-react";

export function ContentLoading({ label = "Loading" }: { label?: string }) {
  return <div className="flex justify-center py-16 text-muted-foreground" role="status" aria-label={label}>
    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
  </div>;
}
