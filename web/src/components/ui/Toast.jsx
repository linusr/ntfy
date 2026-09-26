import * as React from "react";
import * as RadixToast from "@radix-ui/react-toast";

const ToastContext = React.createContext(() => {});

/** Transient messages ("Copied to clipboard"); `useToast()` returns a function taking the text. */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = React.useState([]);
  const show = React.useCallback((message) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), message }]);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider duration={3000}>
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            onOpenChange={(open) => !open && setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="rounded-xl bg-text px-4 py-3 text-sm font-medium text-bg shadow-xl"
          >
            <RadixToast.Description>{toast.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-24 left-1/2 z-[60] flex w-max max-w-[90vw] -translate-x-1/2 flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = () => React.useContext(ToastContext);
