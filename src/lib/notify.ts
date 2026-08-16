import { toast } from "sonner";

export function notifyOk(message: string) {
  if (!message) return;
  toast.success(message);
}

export function notifyErr(message: string) {
  if (!message) return;
  toast.error(message);
}
