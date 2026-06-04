type ToastHandler = (message: string) => void;

let toastHandler: ToastHandler | null = null;

export function bindToastHandler(handler: ToastHandler | null) {
  toastHandler = handler;
}

export function showToast(message: string) {
  toastHandler?.(message);
}
