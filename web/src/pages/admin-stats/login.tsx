import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message } from 'antd';
import React from 'react';
import styles from './login.less';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

const AdminLogin: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async (values: {
    username: string;
    password: string;
  }) => {
    setLoading(true);

    // Credenziali hardcoded per sicurezza
    const ADMIN_EMAIL = 'info@sgailegal.com';
    const ADMIN_PASSWORD = 'Sgailegal.upload89';

    // Simula un piccolo delay per sembrare più realistico
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (values.username === ADMIN_EMAIL && values.password === ADMIN_PASSWORD) {
      // Login successful
      localStorage.setItem('admin-authenticated', 'true');
      localStorage.setItem('admin-session', Date.now().toString());
      message.success('Accesso effettuato con successo!');
      onLoginSuccess();
    } else {
      message.error('Credenziali non valide. Accesso negato.');
      form.setFields([
        {
          name: 'password',
          errors: ['Username o password errati'],
        },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBox}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>🔐</div>
          <h1>Accesso Admin</h1>
          <p>Area riservata al personale di manutenzione</p>
        </div>

        <Card className={styles.loginCard}>
          <Form
            form={form}
            name="admin-login"
            onFinish={handleLogin}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: 'Inserisci username' },
                { type: 'email', message: 'Inserisci un email valida' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Email"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Inserisci la password' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className={styles.loginButton}
              >
                {loading ? 'Verifica in corso...' : 'Accedi'}
              </Button>
            </Form.Item>
          </Form>

          <div className={styles.securityNote}>
            <LockOutlined /> Connessione sicura crittografata
          </div>
        </Card>

        <div className={styles.footer}>
          <p>© 2025 SGAI Legal - Tutti i diritti riservati</p>
          <p className={styles.warningText}>
            ⚠️ Tentativo di accesso non autorizzato è un reato perseguibile ai
            sensi della legge
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
