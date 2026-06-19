import React, { useEffect, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { useWorkspace } from "@/lib/workspace-context";
import { useReadFile, useWriteFile, getReadFileQueryKey } from "@workspace/api-client-react";
import { X, Circle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function Editor() {
  const { activeFile, openFiles, setActiveFile, closeFile, markFileSaved, markFileUnsaved, workspacePath } = useWorkspace();
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const { data: fileData, isLoading } = useReadFile(
    { path: activeFile || "", workspace: workspacePath },
    { query: { enabled: !!activeFile, queryKey: getReadFileQueryKey({ path: activeFile || "", workspace: workspacePath }) } }
  );

  const writeFile = useWriteFile();

  const activeFileObj = openFiles.find(f => f.path === activeFile);

  useEffect(() => {
    if (fileData) {
      setContent(fileData.content);
      if (activeFile) {
        markFileSaved(activeFile);
      }
    } else {
      setContent("");
    }
  }, [fileData?.content, activeFile]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      if (activeFile && value !== fileData?.content) {
        markFileUnsaved(activeFile);
      } else if (activeFile) {
        markFileSaved(activeFile);
      }
    }
  };

  const handleSave = () => {
    if (!activeFile) return;
    writeFile.mutate({ data: { path: activeFile, content, workspace: workspacePath } }, {
      onSuccess: () => {
        markFileSaved(activeFile);
        queryClient.invalidateQueries({ queryKey: getReadFileQueryKey({ path: activeFile, workspace: workspacePath }) });
      }
    });
  };

  if (openFiles.length === 0) {
    return (
      <div className="h-full w-full bg-card flex flex-col items-center justify-center text-muted-foreground">
        <div className="text-4xl font-bold opacity-10 mb-4 tracking-tighter">FTM-CODER-AI</div>
        <div className="text-sm">Cmd/Ctrl + P to search files</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-card flex flex-col" data-testid="container-editor">
      <div className="flex items-end border-b border-border bg-sidebar overflow-x-auto no-scrollbar">
        {openFiles.map(file => (
          <div 
            key={file.path}
            className={`flex items-center gap-2 h-9 px-4 border-r border-border cursor-pointer select-none text-sm transition-colors min-w-[120px] max-w-[200px]
              ${activeFile === file.path ? "bg-card text-foreground border-t-2 border-t-primary" : "bg-muted text-muted-foreground hover:bg-card/50"}`}
            onClick={() => setActiveFile(file.path)}
          >
            <span className="truncate flex-1" title={file.path}>{file.path.split("/").pop()}</span>
            <div 
              className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
            >
              {file.isUnsaved ? <Circle className="h-2 w-2 fill-primary text-primary" /> : <X className="h-3 w-3" />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 relative">
        {isLoading && activeFile ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10 bg-card/50 backdrop-blur-sm">Loading...</div>
        ) : null}
        {activeFile && (
          <MonacoEditor
            theme="vs-dark"
            path={activeFile}
            value={content}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineHeight: 21,
              fontFamily: "var(--app-font-mono)",
              wordWrap: "on",
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
            }}
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                handleSave();
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
