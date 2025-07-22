import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  PersistedProjectState,
  loadProject,
  saveProject,
  clearProject as clearProjectStorage,
  CURRENT_VERSION,
} from "@/lib/projectStorage";

export const useProjectState = () => {
  const [state, setState] = useState<PersistedProjectState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadProject();
    setState(loaded);
    setIsLoaded(true);
  }, []);

  // Debounced auto-save to prevent excessive writes
  useEffect(() => {
    if (isLoaded && state) {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set a new timeout to save after a brief delay
      saveTimeoutRef.current = setTimeout(() => {
        saveProject(state);
      }, 100); // 100ms debounce
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, isLoaded]);

  const updateState = useCallback((updates: Partial<PersistedProjectState>) => {
    setState((prevState) => {
      if (!prevState) {
        // Create new state with required fields
        return {
          pitch: "",
          style: "Photographic",
          language: { name: "English (United States)", code: "en-US" },
          numScenes: 6,
          withVoiceOver: false,
          logoOverlay: null,
          customStyles: [],
          selectedVeoModel: process.env.NEXT_PUBLIC_MODEL!,
          scenario: undefined,
          scenes: [],
          videoUri: null,
          vttUri: null,
          activeTab: "create",
          projectId: uuidv4(),
          lastModified: new Date(),
          version: CURRENT_VERSION,
          ...updates,
        };
      }

      return {
        ...prevState,
        ...updates,
        lastModified: new Date(),
      };
    });
  }, []);

  const clearProject = useCallback(() => {
    if (confirm("Clear all progress and start over?")) {
      clearProjectStorage();
      setState(null);
      window.location.reload();
    }
  }, []);

  return {
    state,
    updateState,
    clearProject,
    isLoaded,
  };
};
