import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ChatMessage } from "@workspace/api-client-react";
import { getStoredUser } from "@/lib/auth";

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
  terminalSendRef: React.MutableRefObject<((cmd: string) => void) | null>;
  sendToTerminal: (cmd: string) => void;
  killTerminal: () => void;
  onLogout?: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

interface Props {
  children: React.ReactNode;
  /** The server-returned workspace path for the logged-in user */
  initialWorkspace: string;
  onLogout?: () => void;
}

export function WorkspaceProvider({ children, initialWorkspace, onLogout }: Props) {
  // Derive default from user dir (server path) falling back to stored or built-in default
  const defaultPath = (() => {
    if (initialWorkspace) return initialWorkspace;
    const user = getStoredUser();
    if (user) return `/home/users/${user.username}`;
    return "/home/users";
  })();

  const [workspacePath, setWorkspacePathState] = useState<string>(defaultPath);

  const setWorkspacePath = (path: string) => {
    setWorkspacePathState(path);
    localStorage.setItem("workspacePath", path);
  };

  // Sync workspace path whenever initialWorkspace changes (e.g. after login)
  useEffect(() => {
    if (initialWorkspace) setWorkspacePathState(initialWorkspace);
  }, [initialWorkspace]);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const terminalSendRef = useRef<((cmd: string) => void) | null>(null);

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

  const markFileSaved = (path: string) =>
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, isUnsaved: false } : f)));

  const markFileUnsaved = (path: string) =>
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, isUnsaved: true } : f)));

  const addChatMessage = (msg: ChatMessage) => setChatHistory((prev) => [...prev, msg]);

  const sendToTerminal = (cmd: string) => terminalSendRef.current?.(cmd);
  const killTerminal   = () => terminalSendRef.current?.("\x03");

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
        addChatMessage,
        terminalSendRef,
        sendToTerminal,
        killTerminal,
        onLogout,
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
