import React, { useState } from 'react';
import { Flex, List, Typography, Tooltip, Button, Tag } from 'antd';
import { CopyOutlined, DownloadOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { IReference } from '@/interfaces/database/chat';

const { Text } = Typography;

interface SourceListProps {
  docs: IReference['doc_aggs'];
  onSourceClick?: (idx: number) => void;
  onCopyMarker?: (marker: string) => void;
}

const MAX_PREVIEW = 180;

const SourceList: React.FC<SourceListProps> = ({ docs, onSourceClick, onCopyMarker }) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

  return (
    <List
      size="small"
      itemLayout="vertical"
      dataSource={docs}
      renderItem={(doc, idx) => {
        const marker = `##${idx + 1}$$`;
        const long = !!doc.chunk_preview && doc.chunk_preview.length > MAX_PREVIEW;
        const showAll = expanded[idx];

        // Se hai un vero endpoint per il download binario, usa quello
        const downloadHref = buildDownloadUrl(doc.doc_id, doc.url);

        return (
          <List.Item
            style={{
              padding: '8px 0',
              border: 'none',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Flex vertical gap={4}>
              <Flex align="center" gap={8} wrap="wrap">
                <Tag color="blue" style={{ marginRight: 0 }}>{marker}</Tag>

                <a
                  href={doc.url || '#'}
                  target={doc.url ? '_blank' : undefined}
                  rel={doc.url ? 'noreferrer' : undefined}
                  style={{ color: '#0f4faa', wordBreak: 'break-word', fontWeight: 500 }}
                >
                  {doc.doc_name || 'Documento senza nome'}
                </a>

                <Flex gap={4} align="center">
                  {onSourceClick && (
                    <Tooltip title="Apri nel PDF / dettaglio">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => onSourceClick(idx)}
                        size="small"
                      />
                    </Tooltip>
                  )}

                  {onCopyMarker && (
                    <Tooltip title="Copia marker">
                      <Button
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => onCopyMarker(marker)}
                        size="small"
                      />
                    </Tooltip>
                  )}

                  {doc.url && (
                    <Tooltip title="Apri link esterno">
                      <Button
                        type="text"
                        icon={<LinkOutlined />}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        size="small"
                      />
                    </Tooltip>
                  )}

                  <Tooltip title="Scarica documento">
                    <Button
                      type="text"
                      icon={<DownloadOutlined />}
                      href={downloadHref}
                      download
                      size="small"
                    />
                  </Tooltip>
                </Flex>
              </Flex>

              {doc.chunk_preview && (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {showAll
                      ? doc.chunk_preview
                      : doc.chunk_preview.slice(0, MAX_PREVIEW) + (long ? '…' : '')}
                  </Text>
                  {long && (
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => toggle(idx)}
                    >
                      {showAll ? 'Mostra meno' : 'Mostra altro'}
                    </Button>
                  )}
                </>
              )}
            </Flex>
          </List.Item>
        );
      }}
    />
  );
};

export default SourceList;

// --- Se non hai un endpoint dedicato, usa doc.url. Se doc.url è HTML, serve un endpoint download.
// Modifica in base al tuo backend (esempio generico /api/document/{doc_id}/download).
function buildDownloadUrl(docId?: string, fallbackUrl?: string) {
  if (docId) {
    return `/api/document/${docId}/download`; // <-- ADATTA a tua API
  }
  return fallbackUrl || '#';
}
