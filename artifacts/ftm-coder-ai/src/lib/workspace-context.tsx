import React, { createContext, useContext, useState, useEffect } from "react";
import type { ChatMessage, PendingChange } from "@workspace/api-client-react";

export type OpenFile = {
  path: string;
  isUnsaved?: boolean;
};

interface WorkspaceState {
  workspacePath: string;
  setWorkspacePath: (path: string) => void;
  openFiles: OpenFile[];
  activeFile: string | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  markFileSaved: (path: string) => void;
  markFileUnsaved: (path: string) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspacePath, setWorkspacePath] = useState<string>(() => {
    return localStorage.getItem("workspacePath") || "/home/runner/workspace";
  });
  
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  useEffect(() => {
    localStorage.setItem("workspacePath", workspacePath);
  }, [workspacePath]);

  const openFile = (path: string) => {
    if (!openFiles.find((f) => f.path === path)) {
      setOpenFiles((prev) => [...prev, { path }]);
    }
    setActiveFile(path);
  };

  const closeFile = (path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activeFile === path) {
        setActiveFile(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  };

  const markFileSaved = (path: string) => {
    setOpenFiles((prev) => prev.map((f) => f.path === path ? { ...f, isUnsaved: false } : f));
  };

  const markFileUnsaved = (path: string) => {
    setOpenFiles((prev) => prev.map((f) => f.path === path ? { ...f, isUnsaved: true } : f));
  };

  const addChatMessage = (msg: ChatMessage) => {
    setChatHistory((prev) => [...prev, msg]);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspacePath,
        setWorkspacePath,
        openFiles,
        activeFile,
        openFile,
        closeFile,
        setActiveFile,
        markFileSaved,
        markFileUnsaved,
        chatHistory,
        setChatHistory,
        addChatMessage
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
