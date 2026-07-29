import {
  ClockCircleOutlined,
  GlobalOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './index.less';
import AdminLogin from './login';
import AdminOperations from './operations';

const { RangePicker } = DatePicker;

interface ConversationMessage {
  type: 'question' | 'answer';
  text: string;
  timestamp: number;
}

interface UserSession {
  id: string;
  sessionId: string;
  userId: string;
  email?: string;
  plan: 'free' | 'premium' | 'beta';
  loginTime: string;
  ipAddress: string;
  userAgent: string;
  country?: string;
  city?: string;
  browser?: string;
  os?: string;
  messagesCount: number;
  conversation: ConversationMessage[];
  duration: number;
  tokens: number;
}

interface KnowledgeStats {
  dataset: string;
  total: number;
  chunkSum: number;
  statusCounts: Record<string, number>;
  progress: number;
  remaining: number;
  lastStartedAt?: string | null;
  found?: boolean;
}

function calculateDailyStats(sessionsList: UserSession[]) {
  const dailyMap = new Map<
    string,
    {
      date: string;
      sessions: number;
      messages: number;
      tokens: number;
      users: Set<string>;
    }
  >();
  sessionsList.forEach((session) => {
    if (!session.loginTime || session.loginTime === 'N/A') return;
    const date = session.loginTime.split(' ')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        sessions: 0,
        messages: 0,
        tokens: 0,
        users: new Set(),
      });
    }
    const day = dailyMap.get(date);
    if (!day) return;
    day.sessions += 1;
    day.messages += session.messagesCount || 0;
    day.tokens += session.tokens || 0;
    day.users.add(session.userId);
  });
  return Array.from(dailyMap.values())
    .map((day) => ({
      date: day.date,
      sessioni: day.sessions,
      messaggi: day.messages,
      tokens: day.tokens,
      utenti: day.users.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const AdminStats: React.FC = () => {
  // ⚠️ IMPORTANTE: Tutti gli useState DEVONO essere dichiarati PRIMA di qualsiasi return condizionale
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null,
  );
  // Statistiche aggregate - SPOSTATO QUI prima del return
  const [stats, setStats] = useState({
    totalUsers: 0,
    freeUsers: 0,
    premiumUsers: 0,
    betaTesters: 0,
    todayLogins: 0,
    uniqueCountries: 0,
  });
  // Dati per grafici giornalieri
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(
    null,
  );
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const controller = new AbortController();
    fetch('/v1/admin/auth/status', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((result) => setIsAuthenticated(Boolean(result.data?.authenticated)))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthChecking(false));
    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/v1/admin/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      setIsAuthenticated(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };
  const handleUnauthorized = React.useCallback(
    () => setIsAuthenticated(false),
    [],
  );

  const fetchUserSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/v1/admin/user-sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.code === 0 && result.data) {
          setSessions(result.data.sessions || []);
          if (result.data.stats) setStats(result.data.stats);

          // Calcola statistiche giornaliere per i grafici
          const dailyData = calculateDailyStats(result.data.sessions || []);
          setDailyStats(dailyData);
          setSessionsError('');
        } else {
          throw new Error(result.message || 'Risposta API non valida');
        }
      } else {
        if (response.status === 401) setIsAuthenticated(false);
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      setSessionsError(
        error instanceof Error ? error.message : 'Errore caricamento sessioni',
      );
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // useEffect per caricare dati - DEVE essere prima del return condizionale
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserSessions();
    }
  }, [fetchUserSessions, isAuthenticated]);

  const fetchKnowledgeStats = async () => {
    setKnowledgeLoading(true);
    try {
      const response = await fetch(
        '/v1/admin/knowledge-status?dataset=SENTENZE%20BANCA%20DATI%20MEF',
        { credentials: 'same-origin' },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      if (result.code === 0 && result.data) {
        setKnowledgeStats(result.data as KnowledgeStats);
      }
    } catch (error) {
      console.error('Errore nel recupero stato knowledge:', error);
      setSessionsError(
        error instanceof Error ? error.message : 'Errore stato knowledge',
      );
    } finally {
      setKnowledgeLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchKnowledgeStats();
    }
  }, [isAuthenticated]);

  if (authChecking) {
    return <div className={styles.adminContainer}>Verifica sessione…</div>;
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  const columns: ColumnsType<UserSession> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || <Tag color="orange">Anonimo</Tag>,
    },
    {
      title: 'Piano',
      dataIndex: 'plan',
      key: 'plan',
      render: (plan: string) => {
        const colors = {
          free: 'default',
          premium: 'gold',
          beta: 'purple',
        };
        return (
          <Tag color={colors[plan as keyof typeof colors]}>
            {plan.toUpperCase()}
          </Tag>
        );
      },
      filters: [
        { text: 'Free', value: 'free' },
        { text: 'Premium', value: 'premium' },
        { text: 'Beta', value: 'beta' },
      ],
      onFilter: (value, record) => record.plan === value,
    },
    {
      title: 'Login Time',
      dataIndex: 'loginTime',
      key: 'loginTime',
      sorter: (a, b) =>
        new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime(),
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
    },
    {
      title: 'Location',
      key: 'location',
      render: (_, record) => (
        <span>
          {record.city && record.country
            ? `${record.city}, ${record.country}`
            : 'Unknown'}
        </span>
      ),
    },
    {
      title: 'Browser',
      dataIndex: 'browser',
      key: 'browser',
    },
    {
      title: 'OS',
      dataIndex: 'os',
      key: 'os',
    },
    {
      title: 'Messaggi',
      dataIndex: 'messagesCount',
      key: 'messagesCount',
      sorter: (a, b) => a.messagesCount - b.messagesCount,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: 'Tokens',
      dataIndex: 'tokens',
      key: 'tokens',
      sorter: (a, b) => a.tokens - b.tokens,
    },
  ];

  return (
    <div className={styles.adminContainer}>
      <div className={styles.header}>
        <div>
          <h1>📊 Statistiche Utenti SGAI</h1>
          <p className={styles.subtitle}>
            Dashboard amministrativa - Accesso limitato al personale di
            manutenzione
          </p>
        </div>
        <Button
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          className={styles.logoutBtn}
        >
          Logout
        </Button>
      </div>

      <AdminOperations onUnauthorized={handleUnauthorized} />

      {sessionsError && (
        <Alert
          className={styles.apiError}
          type="error"
          showIcon
          message="Dati amministrativi non aggiornati"
          description={sessionsError}
        />
      )}

      {/* Filtro date */}
      <Card className={styles.filterCard}>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={(dates) =>
              setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)
            }
            format="YYYY-MM-DD"
          />
          <button
            type="button"
            onClick={() => setDateRange(null)}
            className={styles.resetButton}
          >
            Reset
          </button>
        </Space>
      </Card>

      {/* Statistiche aggregate */}
      <Row gutter={16} className={styles.statsRow}>
        <Col span={4}>
          <Card>
            <Statistic
              title="Totale Utenti"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Utenti Free"
              value={stats.freeUsers}
              valueStyle={{ color: '#666' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Utenti Premium"
              value={stats.premiumUsers}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Beta Testers"
              value={stats.betaTesters}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Login Oggi"
              value={stats.todayLogins}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Paesi Unici"
              value={stats.uniqueCountries}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Stato dataset sentenze */}
      {knowledgeStats && (
        <Card
          className={styles.knowledgeCard}
          title="📚 Stato dataset «SENTENZE BANCA DATI MEF»"
          loading={knowledgeLoading}
          extra={
            <Button size="small" onClick={fetchKnowledgeStats}>
              Aggiorna
            </Button>
          }
        >
          <div className={styles.knowledgeContent}>
            <div className={styles.knowledgeProgress}>
              <Progress
                type="circle"
                percent={Math.min(
                  100,
                  Math.round((knowledgeStats.progress || 0) * 1000) / 10,
                )}
                format={(value) => `${value?.toFixed(1)}%`}
                strokeColor="#52c41a"
              />
              <div className={styles.knowledgeSummary}>
                <span>
                  <strong>
                    {knowledgeStats.statusCounts?.done?.toLocaleString() ?? 0}
                  </strong>{' '}
                  documenti completati
                </span>
                <span>
                  <strong>{knowledgeStats.total.toLocaleString()}</strong>{' '}
                  documenti totali
                </span>
                <span>
                  <strong>{knowledgeStats.remaining.toLocaleString()}</strong>{' '}
                  in attesa di completamento
                </span>
                {knowledgeStats.lastStartedAt && (
                  <span>
                    Ultimo job avviato il{' '}
                    {new Date(knowledgeStats.lastStartedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className={styles.statusList}>
              {[
                ['done', '✅ Completati'],
                ['running', '🔄 In esecuzione'],
                ['unstart', '⌛ In coda'],
                ['cancel', '⏹️ Annullati'],
                ['fail', '⚠️ Falliti'],
              ].map(([key, label]) => (
                <div key={key} className={styles.statusItem}>
                  <span className={styles.statusLabel}>{label}</span>
                  <span className={styles.statusValue}>
                    {knowledgeStats.statusCounts?.[key]?.toLocaleString() ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Grafici Andamento Giornaliero */}
      {dailyStats.length > 0 && (
        <Row gutter={16} className={styles.chartsRow}>
          <Col span={12}>
            <Card
              title="📈 Andamento Sessioni Giornaliere"
              className={styles.chartCard}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sessioni"
                    stroke="#667eea"
                    strokeWidth={2}
                    name="Sessioni"
                  />
                  <Line
                    type="monotone"
                    dataKey="utenti"
                    stroke="#764ba2"
                    strokeWidth={2}
                    name="Utenti Unici"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col span={12}>
            <Card
              title="📊 Messaggi e Tokens per Giorno"
              className={styles.chartCard}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="messaggi" fill="#667eea" name="Messaggi" />
                  <Bar dataKey="tokens" fill="#764ba2" name="Tokens" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      )}

      {/* Tabella sessioni */}
      <Card
        className={styles.tableCard}
        title="📋 Sessioni Utenti (Clicca per espandere e vedere messaggi)"
      >
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="sessionId"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Totale ${total} sessioni`,
          }}
          scroll={{ x: 1400 }}
          expandable={{
            expandedRowRender: (record) => (
              <div className={styles.conversationDetail}>
                <h4>💬 Conversazione Completa</h4>
                <div className={styles.conversationMessages}>
                  {record.conversation && record.conversation.length > 0 ? (
                    record.conversation.map((msg, idx) => (
                      <div
                        key={idx}
                        className={
                          msg.type === 'question'
                            ? styles.questionMessage
                            : styles.answerMessage
                        }
                      >
                        <div className={styles.messageHeader}>
                          <span className={styles.messageRole}>
                            {msg.type === 'question' ? '👤 Utente' : '🤖 SGAI'}
                          </span>
                          <span className={styles.messageTime}>
                            {msg.timestamp
                              ? new Date(msg.timestamp * 1000).toLocaleString()
                              : ''}
                          </span>
                        </div>
                        <div className={styles.messageContent}>{msg.text}</div>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>
                      Nessun messaggio disponibile
                    </p>
                  )}
                </div>
                <div className={styles.sessionMeta}>
                  <span>📊 Durata: {Math.round(record.duration || 0)}s</span>
                  <span>🔤 Token usati: {record.tokens || 0}</span>
                  <span>🆔 Session ID: {record.sessionId}</span>
                </div>
              </div>
            ),
            rowExpandable: (record) =>
              record.conversation && record.conversation.length > 0,
          }}
        />
      </Card>

      {/* Warning footer */}
      <Card className={styles.warningCard}>
        <p>
          <strong>⚠️ Attenzione:</strong> Questa pagina contiene dati sensibili
          degli utenti. L&apos;accesso è limitato al personale autorizzato. Non
          condividere queste informazioni.
        </p>
      </Card>
    </div>
  );
};

export default AdminStats;
