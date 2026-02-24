export type ToastType = 'success' | 'error' | 'info';

export type ToastMessage = {
  type?: ToastType;
  message: string;
};

const EVENT_NAME = 'ctt:toast';

export function notify(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastMessage>(EVENT_NAME, { detail: { message, type } }));
}

export function subscribeToToast(callback: (payload: ToastMessage) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ToastMessage>;
    if (!customEvent.detail?.message) return;
    callback(customEvent.detail);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}
