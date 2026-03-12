"use client";

import { DecisionDocFormat } from "@digmo/shared";
import { ChangeEvent, useMemo, useState } from "react";
import { 
  FileTextOutlined, 
  UploadOutlined, 
  LoadingOutlined,
  DownOutlined,
  UpOutlined,
  SaveOutlined
} from "@ant-design/icons";
import { Button, Card, Input, Tag, Upload, Typography, Space, Spin } from "antd";

const { Text } = Typography;
const { TextArea } = Input;

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

  async function handleUpload(file: File) {
    await onDocUpload(file);
    setIsDocContentExpanded(true);
    return false; // Prevent automatic upload by Antd
  }

  return (
    <div className="space-y-4">
      <Card
        title={
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>策略文档（Info）</Text>
              <Space>
                 {typeof docVersion === "number" ? <Tag>版本 v{docVersion}</Tag> : null}
                 <Upload 
                    beforeUpload={handleUpload} 
                    showUploadList={false} 
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                 >
                    <Button icon={<UploadOutlined />} disabled={isBusy} size="small">上传</Button>
                 </Upload>
              </Space>
           </div>
        }
      >
        <Spin spinning={isGeneratingSuggestion} tip="正在更新建议...">
           <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!hasUploadedDoc ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'rgba(0,0,0,0.45)', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
                  {isLoading ? "加载中..." : "暂无策略文档，请先上传文件。"}
                </div>
              ) : (
                <div style={{ padding: 12, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>已上传文件</Text>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                         <Text strong>{displayFileName}</Text>
                      </div>
                    </div>
                    <Button
                      type="text"
                      size="small"
                      icon={isDocContentExpanded ? <UpOutlined /> : <DownOutlined />}
                      onClick={() => setIsDocContentExpanded((prev) => !prev)}
                      disabled={isBusy}
                    >
                      {isDocContentExpanded ? "收起内容" : "查看内容"}
                    </Button>
                  </div>
                </div>
              )}

              {hasUploadedDoc && isDocContentExpanded ? (
                <div style={{ padding: 12, border: '1px solid #f0f0f0', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Space style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                    <FileTextOutlined />
                    文档格式：{docFormat}
                  </Space>
                  <TextArea
                    rows={10}
                    placeholder="策略文档内容"
                    value={docContent}
                    onChange={(event) => onDocContentChange(event.target.value)}
                    disabled={isBusy}
                  />
                  <div>
                    <Button 
                       type="primary" 
                       icon={<SaveOutlined />} 
                       onClick={() => void onSaveDoc()} 
                       disabled={isBusy || !docContent.trim()}
                    >
                      保存文档
                    </Button>
                  </div>
                </div>
              ) : null}
           </div>
        </Spin>
      </Card>
    </div>
  );
}
