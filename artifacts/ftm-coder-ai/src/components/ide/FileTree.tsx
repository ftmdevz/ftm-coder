import React, { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useListFiles, type FileNode } from "@workspace/api-client-react";
import { ChevronRight, ChevronDown, FileIcon, Folder, FileJson, FileCode2, FileText, Loader2 } from "lucide-react";
import { getListFilesQueryKey } from "@workspace/api-client-react";

export function FileTree() {
  const { workspacePath, activeFile, openFile } = useWorkspace();
  const { data: treeData, isLoading } = useListFiles({ workspace: workspacePath }, {
    query: { enabled: !!workspacePath, queryKey: getListFilesQueryKey({ workspace: workspacePath }) }
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-sidebar border-r border-border overflow-y-auto p-2" data-testid="container-filetree">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider">Explorer</div>
      {treeData?.files?.map((node) => (
        <TreeNode key={node.path} node={node} level={0} activePath={activeFile} onSelect={openFile} />
      ))}
    </div>
  );
}

function TreeNode({ node, level, activePath, onSelect }: { node: FileNode, level: number, activePath: string | null, onSelect: (p: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isDir = node.type === "directory";
  const isActive = activePath === node.path;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelect(node.path);
    }
  };

  const getIcon = () => {
    if (isDir) return expanded ? <Folder className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-muted-foreground" />;
    if (node.name.endsWith(".json")) return <FileJson className="h-4 w-4 text-yellow-500" />;
    if (node.name.endsWith(".ts") || node.name.endsWith(".tsx")) return <FileCode2 className="h-4 w-4 text-blue-400" />;
    if (node.name.endsWith(".md")) return <FileText className="h-4 w-4 text-muted-foreground" />;
    return <FileIcon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div>
      <div 
        className={`flex items-center gap-1.5 py-1 px-2 hover:bg-muted cursor-pointer rounded-sm text-sm transition-colors ${isActive ? "bg-muted text-primary font-medium" : "text-foreground"}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleToggle}
        data-testid={`file-${node.path}`}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isDir && (expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
        </div>
        {getIcon()}
        <span className="truncate">{node.name}</span>
      </div>
      {isDir && expanded && node.children?.map(child => (
        <TreeNode key={child.path} node={child} level={level + 1} activePath={activePath} onSelect={onSelect} />
      ))}
    </div>
  );
}
