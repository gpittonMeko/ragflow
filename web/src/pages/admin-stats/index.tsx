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

interface UserSession {
  id: string;
  email?: string;
  plan: 'free' | 'premium' | 'beta';
  loginTime: string;
  ipAddress: string;
  userAgent: string;
  country?: string;
  city?: string;
  browser?: string;
  os?: string;
}

const AdminStats: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null,
  );

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

  // Statistiche aggregate
  const [stats, setStats] = useState({
    totalUsers: 0,
    freeUsers: 0,
    premiumUsers: 0,
    betaTesters: 0,
    todayLogins: 0,
    uniqueCountries: 0,
  });

  useEffect(() => {
    fetchUserSessions();
  }, [dateRange]);

  const fetchUserSessions = async () => {
    setLoading(true);
    try {
      // TODO: Chiamata API al backend per ottenere le sessioni
      const response = await fetch('/api/admin/user-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      // Mock data per testing
      loadMockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    const mockSessions: UserSession[] = [
      {
        id: '1',
        email: 'user@example.com',
        plan: 'premium',
        loginTime: '2025-11-04 10:30:00',
        ipAddress: '151.18.xx.xx',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        country: 'Italy',
        city: 'Milan',
        browser: 'Chrome',
        os: 'Windows 10',
      },
      {
        id: '2',
        plan: 'free',
        loginTime: '2025-11-04 09:15:00',
        ipAddress: '89.45.xx.xx',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        country: 'Italy',
        city: 'Rome',
        browser: 'Safari',
        os: 'macOS',
      },
      {
        id: '3',
        email: 'beta@test.com',
        plan: 'beta',
        loginTime: '2025-11-04 08:45:00',
        ipAddress: '192.168.xx.xx',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        country: 'Italy',
        city: 'Turin',
        browser: 'Firefox',
        os: 'Linux',
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
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Totale ${total} sessioni`,
          }}
          scroll={{ x: 1200 }}
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
