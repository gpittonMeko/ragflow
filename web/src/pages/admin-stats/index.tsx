import {
  ClockCircleOutlined,
  GlobalOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import styles from './index.less';
import AdminLogin from './login';

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

const AdminStats: React.FC = () => {
  // ⚠️ IMPORTANTE: Tutti gli useState DEVONO essere dichiarati PRIMA di qualsiasi return condizionale
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  // Check authentication on mount
  useEffect(() => {
    const authenticated = localStorage.getItem('admin-authenticated');
    const sessionTime = localStorage.getItem('admin-session');

    if (authenticated === 'true' && sessionTime) {
      // Session expires after 24 hours
      const sessionAge = Date.now() - parseInt(sessionTime);
      if (sessionAge < 24 * 60 * 60 * 1000) {
        setIsAuthenticated(true);
      } else {
        // Session expired
        localStorage.removeItem('admin-authenticated');
        localStorage.removeItem('admin-session');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin-authenticated');
    localStorage.removeItem('admin-session');
    setIsAuthenticated(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  useEffect(() => {
    fetchUserSessions();
  }, [dateRange]);

  const fetchUserSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/v1/admin/user-sessions', {
        method: 'POST',
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
          setStats(result.data.stats || stats);
        } else {
          console.error('API error:', result.message);
          loadMockData();
        }
      } else {
        console.error('HTTP error:', response.status);
        loadMockData();
      }
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      loadMockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    const mockSessions: UserSession[] = [
      {
        id: '1',
        sessionId: 'session-abc123',
        userId: 'user@example.com',
        email: 'user@example.com',
        plan: 'premium',
        loginTime: '2025-11-04 10:30:00',
        ipAddress: '151.18.xx.xx',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        country: 'Italy',
        city: 'Milan',
        browser: 'Chrome',
        os: 'Windows 10',
        messagesCount: 4,
        tokens: 1250,
        duration: 45,
        conversation: [
          {
            type: 'question',
            text: 'Quali sono le scadenze fiscali di novembre?',
            timestamp: 1730716200,
          },
          {
            type: 'answer',
            text: 'Le principali scadenze fiscali di novembre 2025 sono: 16 novembre - versamento IVA mensile, 18 novembre - contributi INPS, 30 novembre - presentazione modelli INTRASTAT.',
            timestamp: 1730716215,
          },
          {
            type: 'question',
            text: 'E per le partite IVA forfettarie?',
            timestamp: 1730716250,
          },
          {
            type: 'answer',
            text: 'Per i forfettari le scadenze principali sono: versamento acconto imposta sostitutiva entro il 30 novembre, non è richiesto il versamento IVA essendo regime forfettario.',
            timestamp: 1730716265,
          },
        ],
      },
      {
        id: '2',
        sessionId: 'session-def456',
        userId: 'anonymous_89.45.120.33',
        plan: 'free',
        loginTime: '2025-11-04 09:15:00',
        ipAddress: '89.45.xx.xx',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        country: 'Italy',
        city: 'Rome',
        browser: 'Safari',
        os: 'macOS',
        messagesCount: 2,
        tokens: 580,
        duration: 28,
        conversation: [
          {
            type: 'question',
            text: 'Come funziona la rivalutazione TFR?',
            timestamp: 1730711700,
          },
          {
            type: 'answer',
            text: "Il TFR viene rivalutato annualmente applicando un tasso fisso dell'1,5% più il 75% dell'aumento ISTAT rispetto all'anno precedente.",
            timestamp: 1730711715,
          },
        ],
      },
      {
        id: '3',
        sessionId: 'session-ghi789',
        userId: 'beta@test.com',
        email: 'beta@test.com',
        plan: 'beta',
        loginTime: '2025-11-04 08:45:00',
        ipAddress: '192.168.xx.xx',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        country: 'Italy',
        city: 'Turin',
        browser: 'Firefox',
        os: 'Linux',
        messagesCount: 6,
        tokens: 2100,
        duration: 120,
        conversation: [
          {
            type: 'question',
            text: 'Dammi informazioni sul regime forfettario 2025',
            timestamp: 1730709900,
          },
          {
            type: 'answer',
            text: 'Il regime forfettario 2025 prevede: limite massimo 85.000€ di ricavi, aliquota 15% (5% primi 5 anni), nessun addebito IVA, contabilità semplificata.',
            timestamp: 1730709915,
          },
          {
            type: 'question',
            text: 'Quali sono i limiti per rimanere nel regime?',
            timestamp: 1730709950,
          },
          {
            type: 'answer',
            text: 'I principali limiti sono: ricavi max 85.000€, spese per collaboratori max 20.000€, non possedere partecipazioni in società, non essere socio in SNC/SAS.',
            timestamp: 1730709965,
          },
          {
            type: 'question',
            text: 'E se supero gli 85.000€?',
            timestamp: 1730710000,
          },
          {
            type: 'answer',
            text: "Se superi gli 85.000€, esci dal regime forfettario dall'anno successivo e passi al regime ordinario con obbligo di partita IVA ordinaria.",
            timestamp: 1730710015,
          },
        ],
      },
    ];

    setSessions(mockSessions);
    setStats({
      totalUsers: 3,
      freeUsers: 1,
      premiumUsers: 1,
      betaTesters: 1,
      todayLogins: 3,
      uniqueCountries: 1,
    });
  };

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

      {/* Tabella sessioni */}
      <Card className={styles.tableCard} title="📋 Sessioni Utenti">
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
          degli utenti. L'accesso è limitato al personale autorizzato. Non
          condividere queste informazioni.
        </p>
      </Card>
    </div>
  );
};

export default AdminStats;
