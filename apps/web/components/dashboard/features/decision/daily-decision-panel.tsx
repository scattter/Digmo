"use client";

import { DecisionDocFormat } from "@digmo/shared";
import { ChangeEvent, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileText, FileUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DailyDecisionPanelProps {
  isBusy: boolean;
  isLoading: boolean;
  isGeneratingSuggestion: boolean;
  docContent: string;
  docFormat: DecisionDocFormat;
  docVersion?: number;
  docFileName?: string;
  onDocContentChange: (value: string) => void;
  onDocUpload: (file: File) => Promise<void>;
  onSaveDoc: () => Promise<void>;
}

function defaultFileNameByFormat(format: DecisionDocFormat): string {
  return format === "MARKDOWN" ? "策略文档.md" : "策略文档.txt";
}

export function DailyDecisionPanel(props: DailyDecisionPanelProps) {
  const {
    isBusy,
    isLoading,
    isGeneratingSuggestion,
    docContent,
    docFormat,
    docVersion,
    docFileName,
    onDocContentChange,
    onDocUpload,
    onSaveDoc,
  } = props;
  const [isDocContentExpanded, setIsDocContentExpanded] = useState(false);

  const hasUploadedDoc = useMemo(() => {
    if (typeof docVersion === "number") {
      return true;
    }
    if (docContent.trim().length > 0) {
      return true;
    }
    return Boolean(docFileName?.trim());
  }, [docContent, docFileName, docVersion]);

  const displayFileName = useMemo(() => {
    const source = docFileName?.trim();
    if (source) {
      return source;
    }
    return defaultFileNameByFormat(docFormat);
  }, [docFileName, docFormat]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await onDocUpload(file);
    setIsDocContentExpanded(true);
    event.target.value = "";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">策略文档（Info）</CardTitle>
          <div className="flex items-center gap-2">
            {typeof docVersion === "number" ? <Badge variant="secondary">版本 v{docVersion}</Badge> : null}
            <label className="inline-flex">
              <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={handleUpload} />
              <Button type="button" variant="secondary" size="sm" asChild disabled={isBusy}>
                <span>
                  <FileUp className="h-4 w-4" />
                  上传
                </span>
              </Button>
            </label>
          </div>
        </CardHeader>
        <CardContent className="relative space-y-3">
          {isGeneratingSuggestion ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在更新建议...
              </div>
            </div>
          ) : null}
          {!hasUploadedDoc ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {isLoading ? "加载中..." : "暂无策略文档，请先上传文件。"}
            </div>
          ) : (
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">已上传文件</p>
                  <p className="truncate text-sm font-medium" title={displayFileName}>
                    {displayFileName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsDocContentExpanded((prev) => !prev)}
                  disabled={isBusy}
                >
                  {isDocContentExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      收起内容
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      查看内容
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {hasUploadedDoc && isDocContentExpanded ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                文档格式：{docFormat}
              </div>
              <textarea
                className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="策略文档内容"
                value={docContent}
                onChange={(event) => onDocContentChange(event.target.value)}
                disabled={isBusy}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => void onSaveDoc()} disabled={isBusy || !docContent.trim()}>
                  保存文档
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
