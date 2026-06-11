import { useState, useCallback, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";

interface ErrorContextValue {
  showError: (message: string) => void;
}

const ErrorContext = createContext<ErrorContextValue>({ showError: () => {} });

export function useError() {
  return useContext(ErrorContext);
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setErrorMessage(null), 300);
  }, []);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(dismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [visible, dismiss]);

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      {errorMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md bg-red-900 text-red-100 border border-red-700 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 transition-all duration-300 cursor-pointer ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
          onClick={dismiss}
          role="alert"
        >
          <span className="text-lg flex-shrink-0 mt-0.5">&#9888;</span>
          <span className="flex-1 text-sm">{errorMessage}</span>
          <button className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none" onClick={(e) => { e.stopPropagation(); dismiss(); }}>&times;</button>
        </div>
      )}
    </ErrorContext.Provider>
  );
}