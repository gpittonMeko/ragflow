import { IReference } from '@/interfaces/database/chat';
import {
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { Button, Flex, List, Tooltip, Typography } from 'antd';
import React, { useState } from 'react';

const { Text } = Typography;

interface SourceListProps {
  docs: IReference['doc_aggs'];
  onSourceClick?: (idx: number) => void;
  onCopyMarker?: (marker: string) => void;
}

const MAX_PREVIEW = 180;

function affinityPercent(sim: unknown): number | null {
  if (sim == null || typeof sim !== 'number' || Number.isNaN(sim)) {
    return null;
  }
  if (sim <= 1) {
    return Math.round(Math.max(0, Math.min(1, sim)) * 100);
  }
  return Math.min(100, Math.round(sim));
}

const SourceList: React.FC<SourceListProps> = ({
  docs,
  onSourceClick,
  onCopyMarker,
}) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

  return (
    <List
      size="small"
      itemLayout="vertical"
      dataSource={docs}
      renderItem={(doc, idx) => {
        const marker = `##${idx + 1}$$`;
        const long =
          !!doc.chunk_preview && doc.chunk_preview.length > MAX_PREVIEW;
        const showAll = expanded[idx];
        const pct = affinityPercent(doc.similarity);

        // Se hai un vero endpoint per il download binario, usa quello
        const downloadHref = buildDownloadUrl(doc.doc_id, doc.url);

        return (
          <List.Item
            style={{
              padding: '8px 0',
              border: 'none',
              borderBottom: '1px solid var(--border-color, #333)',
            }}
          >
            <Flex vertical gap={4}>
              <Flex align="center" gap={8} wrap="wrap">
                <span
                  style={{
                    marginRight: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '0 8px',
                    lineHeight: '22px',
                    borderRadius: 4,
                    border: '1px solid rgba(197, 235, 255, 0.45)',
                    color: 'var(--sgai-link-on-dark, #c5ebff)',
                    background: 'rgba(197, 235, 255, 0.08)',
                  }}
                >
                  {marker}
                </span>

                <a
                  href={doc.url || '#'}
                  target={doc.url ? '_blank' : undefined}
                  rel={doc.url ? 'noreferrer' : undefined}
                  style={{
                    color: 'var(--sgai-doc-link, #c5ebff)',
                    wordBreak: 'break-word',
                    fontWeight: 500,
                  }}
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

              {pct != null && (
                <div style={{ maxWidth: 280 }}>
                  <Flex
                    justify="space-between"
                    style={{ fontSize: 11, marginBottom: 4 }}
                  >
                    <Text type="secondary">Rilevanza stimata</Text>
                    <Text type="secondary">{pct}%</Text>
                  </Flex>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 999,
                        background:
                          'linear-gradient(90deg, #7ec8fa 0%, #c5ebff 100%)',
                      }}
                    />
                  </div>
                </div>
              )}

              {doc.chunk_preview && (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {showAll
                      ? doc.chunk_preview
                      : doc.chunk_preview.slice(0, MAX_PREVIEW) +
                        (long ? '…' : '')}
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
