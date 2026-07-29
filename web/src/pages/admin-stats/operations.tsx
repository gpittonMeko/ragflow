import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './index.less';

type ControlAction = 'pause' | 'resume' | 'stop' | 'drain';
type RequeueStatus = 'unstart' | 'fail' | 'done_without_embeddings';

interface Worker {
  workerId: string;
  live: boolean;
  status: string;
  desiredState?: string;
  currentState?: string;
  updatedAt?: number;
  checkpoint?: Record<string, unknown>;
  queue?: Record<string, number>;
  metrics?: Record<string, number>;
  error?: string | Record<string, unknown> | null;
}

interface ProgressData {
  totalDocuments: number;
  statusCounts: Record<string, number>;
  withEmbedding: number;
  withoutEmbedding: number;
  totalChunks: number;
  averageProgress: number;
  progress?: { average: number; minimum: number; maximum: number };
}

interface DuplicateGroup {
  nomeBase: string;
  copies: number;
  hasDone: boolean;
  hasEmbedding: boolean;
}

const EMPTY_PROGRESS: ProgressData = {
  totalDocuments: 0,
  statusCounts: {},
  withEmbedding: 0,
  withoutEmbedding: 0,
  totalChunks: 0,
  averageProgress: 0,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${payload.error || 'richiesta fallita'}`,
    );
  }
  return payload.data as T;
}

const AdminOperations: React.FC<{ onUnauthorized: () => void }> = ({
  onUnauthorized,
}) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [progress, setProgress] = useState<ProgressData>(EMPTY_PROGRESS);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicatesTotal, setDuplicatesTotal] = useState(0);
  const [pollError, setPollError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number>();
  const [controlBusy, setControlBusy] = useState(false);
  const [requeueStatus, setRequeueStatus] = useState<RequeueStatus>('unstart');
  const [requeueLimit, setRequeueLimit] = useState(10);
  const [dryRun, setDryRun] = useState<{
    status: RequeueStatus;
    limit: number;
    matched: number;
  }>();
  const timerRef = useRef<number>();

  const loadDuplicates = useCallback(async (signal?: AbortSignal) => {
    const result = await api<{
      items: DuplicateGroup[];
      total: number;
    }>('/v1/scraper/duplicates?page=1&page_size=50', { signal });
    setDuplicates(result.items || []);
    setDuplicatesTotal(result.total || 0);
  }, []);

  useEffect(() => {
    let disposed = false;
    let delay = 15000;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const [workerData, progressData] = await Promise.all([
          api<{ workers: Worker[] }>('/v1/scraper/workers/status', {
            signal: controller.signal,
          }),
          api<ProgressData>('/v1/scraper/progress', {
            signal: controller.signal,
          }),
        ]);
        if (disposed) return;
        setWorkers(workerData.workers || []);
        setProgress(progressData || EMPTY_PROGRESS);
        setPollError('');
        setLastUpdated(Date.now());
        delay = 15000;
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const text = error instanceof Error ? error.message : 'Errore API';
        if (text.includes('401')) onUnauthorized();
        setPollError(text);
        delay = Math.min(delay * 2, 60000);
      } finally {
        if (!disposed) timerRef.current = window.setTimeout(poll, delay);
      }
    };

    poll();
    loadDuplicates(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setPollError(
          error instanceof Error ? error.message : 'Errore duplicati',
        );
      }
    });
    return () => {
      disposed = true;
      controller.abort();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [loadDuplicates, onUnauthorized]);

  const totals = useMemo(() => {
    const queue = {
      pending: 0,
      uploading: 0,
      embedding: 0,
      done: 0,
      dead: 0,
    };
    const metrics = { downloaded: 0, uploaded: 0, errors: 0 };
    workers.forEach((worker) => {
      Object.keys(queue).forEach((key) => {
        queue[key as keyof typeof queue] += Number(worker.queue?.[key] || 0);
      });
      metrics.downloaded += Number(
        worker.metrics?.downloaded || worker.metrics?.downloads || 0,
      );
      metrics.uploaded += Number(worker.metrics?.uploaded || 0);
      metrics.errors += Number(
        worker.metrics?.uploadErrors || worker.metrics?.errors || 0,
      );
    });
    return { queue, metrics };
  }, [workers]);

  const sendControl = (action: ControlAction, workerId = 'all') => {
    Modal.confirm({
      title: `Conferma ${action}`,
      content: `Inviare “${action}” a ${workerId === 'all' ? 'tutti i worker' : workerId}?`,
      okText: 'Conferma',
      cancelText: 'Annulla',
      okButtonProps: { danger: action === 'stop' },
      onOk: async () => {
        setControlBusy(true);
        try {
          await api('/v1/scraper/control', {
            method: 'POST',
            body: JSON.stringify({ action, workerId }),
          });
          message.success(`Comando ${action} registrato`);
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : 'Comando fallito',
          );
          throw error;
        } finally {
          setControlBusy(false);
        }
      },
    });
  };

  const runDryRun = async () => {
    try {
      const result = await api<{ matched: number }>('/v1/scraper/requeue', {
        method: 'POST',
        body: JSON.stringify({
          status: requeueStatus,
          limit: requeueLimit,
          dry_run: true,
        }),
      });
      setDryRun({
        status: requeueStatus,
        limit: requeueLimit,
        matched: result.matched || 0,
      });
      message.info(`Dry-run: ${result.matched || 0} documenti corrispondenti`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Dry-run fallito');
    }
  };

  const confirmRequeue = () => {
    if (
      !dryRun ||
      dryRun.status !== requeueStatus ||
      dryRun.limit !== requeueLimit
    ) {
      message.warning('Esegui prima il dry-run con questi parametri');
      return;
    }
    Modal.confirm({
      title: 'Conferma esplicita requeue',
      content: `Rimettere in coda fino a ${requeueLimit} documenti “${requeueStatus}”? Il dry-run ne ha trovati ${dryRun.matched}.`,
      okText: 'Confermo la requeue',
      cancelText: 'Annulla',
      onOk: async () => {
        const result = await api<{ queued: number }>('/v1/scraper/requeue', {
          method: 'POST',
          body: JSON.stringify({
            status: requeueStatus,
            limit: requeueLimit,
            dry_run: false,
          }),
        });
        message.success(`${result.queued || 0} documenti rimessi in coda`);
        setDryRun(undefined);
      },
    });
  };

  const workerColumns: ColumnsType<Worker> = [
    { title: 'Worker', dataIndex: 'workerId', key: 'workerId' },
    {
      title: 'Presenza',
      key: 'live',
      render: (_, worker) => (
        <Tag color={worker.live ? 'green' : 'red'}>
          {worker.live ? 'LIVE' : 'STALE'}
        </Tag>
      ),
    },
    {
      title: 'Stato',
      key: 'state',
      render: (_, worker) =>
        `${worker.currentState || worker.status} → ${worker.desiredState || 'resume'}`,
    },
    {
      title: 'Checkpoint',
      key: 'checkpoint',
      render: (_, worker) =>
        worker.checkpoint ? JSON.stringify(worker.checkpoint) : '—',
    },
    {
      title: 'Aggiornato',
      key: 'updatedAt',
      render: (_, worker) =>
        worker.updatedAt
          ? new Date(worker.updatedAt * 1000).toLocaleString()
          : 'mai',
    },
    {
      title: 'Controlli',
      key: 'controls',
      render: (_, worker) => (
        <Space wrap>
          {(['pause', 'resume', 'drain', 'stop'] as ControlAction[]).map(
            (action) => (
              <Button
                key={action}
                size="small"
                danger={action === 'stop'}
                disabled={controlBusy}
                onClick={() => sendControl(action, worker.workerId)}
              >
                {action}
              </Button>
            ),
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        className={styles.operationsCard}
        title="⚙️ Scraper ed embedding"
        extra={
          <span className={pollError ? styles.staleText : undefined}>
            {pollError
              ? 'Dati stale'
              : lastUpdated
                ? `Aggiornato ${new Date(lastUpdated).toLocaleTimeString()}`
                : 'Caricamento…'}
          </span>
        }
      >
        {pollError && (
          <Alert
            type="error"
            showIcon
            message="Aggiornamento API fallito: i dati mostrati possono essere obsoleti"
            description={pollError}
          />
        )}
        <Row gutter={[12, 12]} className={styles.operationalStats}>
          {Object.entries(totals.queue).map(([key, value]) => (
            <Col xs={12} md={4} key={key}>
              <Statistic title={`Queue ${key}`} value={value} />
            </Col>
          ))}
          <Col xs={12} md={4}>
            <Statistic title="Download" value={totals.metrics.downloaded} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Upload" value={totals.metrics.uploaded} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Errori" value={totals.metrics.errors} />
          </Col>
        </Row>
        <Space wrap className={styles.globalControls}>
          <strong>Tutti i worker:</strong>
          {(['pause', 'resume', 'drain', 'stop'] as ControlAction[]).map(
            (action) => (
              <Button
                key={action}
                danger={action === 'stop'}
                disabled={controlBusy}
                onClick={() => sendControl(action)}
              >
                {action}
              </Button>
            ),
          )}
        </Space>
        <Table
          rowKey="workerId"
          columns={workerColumns}
          dataSource={workers}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: pollError ? 'Dati non disponibili' : 'Nessun worker',
          }}
        />
      </Card>

      <Row gutter={[16, 16]} className={styles.operationsRow}>
        <Col xs={24} xl={12}>
          <Card title="📚 Stato documenti ed embedding">
            <Progress
              percent={Math.round((progress.averageProgress || 0) * 1000) / 10}
              status={pollError ? 'exception' : 'active'}
            />
            <Descriptions column={2} size="small">
              {['unstart', 'running', 'cancel', 'done', 'fail'].map((state) => (
                <Descriptions.Item key={state} label={state}>
                  {progress.statusCounts?.[state] || 0}
                </Descriptions.Item>
              ))}
              <Descriptions.Item label="Con embedding">
                {progress.withEmbedding || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Senza embedding">
                {progress.withoutEmbedding || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Chunk">
                {progress.totalChunks || 0}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="♻️ Requeue controllata">
            <Space wrap>
              <Select
                value={requeueStatus}
                options={[
                  { value: 'unstart', label: 'unstart' },
                  { value: 'fail', label: 'fail' },
                  {
                    value: 'done_without_embeddings',
                    label: 'done senza embedding',
                  },
                ]}
                onChange={(value) => {
                  setRequeueStatus(value);
                  setDryRun(undefined);
                }}
              />
              <Select
                value={requeueLimit}
                options={[10, 50, 100, 200].map((value) => ({
                  value,
                  label: `limite ${value}`,
                }))}
                onChange={(value) => {
                  setRequeueLimit(value);
                  setDryRun(undefined);
                }}
              />
              <Button onClick={runDryRun}>Dry-run obbligatorio</Button>
              <Button
                type="primary"
                disabled={!dryRun}
                onClick={confirmRequeue}
              >
                Conferma requeue
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        className={styles.operationsCard}
        title={`🔎 Report duplicati (${duplicatesTotal})`}
      >
        <Table
          rowKey="nomeBase"
          dataSource={duplicates}
          pagination={false}
          columns={[
            { title: 'Nome base', dataIndex: 'nomeBase', key: 'nomeBase' },
            { title: 'Copie', dataIndex: 'copies', key: 'copies' },
            {
              title: 'Documento done',
              dataIndex: 'hasDone',
              key: 'hasDone',
              render: (value) => (value ? 'Sì' : 'No'),
            },
            {
              title: 'Embedding',
              dataIndex: 'hasEmbedding',
              key: 'hasEmbedding',
              render: (value) => (value ? 'Sì' : 'No'),
            },
          ]}
          locale={{
            emptyText: pollError
              ? 'Report non disponibile'
              : 'Nessun duplicato',
          }}
        />
      </Card>
    </>
  );
};

export default AdminOperations;
