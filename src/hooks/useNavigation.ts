import { useState, useEffect, useCallback } from "react";

export interface UseNavigationReturn {
  path: string;
  navigate: (path: string) => void;
  goBack: () => void;
}

/**
 * Custom hook for managing client-side navigation with history state
 */
export function useNavigation(): UseNavigationReturn {
  const [path, setPath] = useState<string>(() => 
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  const navigate = useCallback((newPath: string) => {
    window.history.pushState({}, "", newPath);
    window.dispatchEvent(new Event("heist-navigate"));
    setPath(newPath);
  }, []);

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("heist-navigate", handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("heist-navigate", handleLocationChange);
    };
  }, []);

  return {
    path,
    navigate,
    goBack,
  };
}
