import React, { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TopBar } from "./TopBar";
import { FileTree } from "./FileTree";
import { Editor } from "./Editor";
import { TerminalPanel } from "./TerminalPanel";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";

export function IDE() {
  const [showTerminal, setShowTerminal] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const rightPanelOpen = showChat || showPreview;

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <TopBar
        showTerminal={showTerminal}
        showChat={showChat}
        showPreview={showPreview}
        onToggleTerminal={() => setShowTerminal(v => !v)}
        onToggleChat={() => { setShowChat(v => !v); if (!showChat) setShowPreview(false); }}
        onTogglePreview={() => { setShowPreview(v => !v); if (!showPreview) setShowChat(false); }}
      />
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" autoSaveId="ide-layout-main">
          <ResizablePanel defaultSize={15} minSize={10} maxSize={30}>
            <FileTree />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={rightPanelOpen ? 60 : 85}>
            <ResizablePanelGroup direction="vertical" autoSaveId="ide-layout-center">
              <ResizablePanel defaultSize={showTerminal ? 75 : 100}>
                <Editor />
              </ResizablePanel>
              {showTerminal && (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={25} minSize={10}>
                    <TerminalPanel onClose={() => setShowTerminal(false)} />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
          {rightPanelOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={50}>
                {showPreview ? (
                  <PreviewPanel onClose={() => setShowPreview(false)} />
                ) : (
                  <ChatPanel />
                )}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
