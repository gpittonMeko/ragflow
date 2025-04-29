import { useLogin, useRegister } from '@/hooks/login-hooks';
import { useSystemConfig } from '@/hooks/system-hooks';
import { rsaPsw } from '@/utils';
import { Button, Checkbox, Form, Input, message } from 'antd'; // Importa il componente message da Ant Design
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, useNavigate } from 'umi';
import RightPanel from './right-panel';

import { Domain } from '@/constants/common';
import styles from './index.less';

const Login = () => {
  // Stato per il titolo (login o register)
  const [title, setTitle] = useState('login');
  // Hook per la navigazione tra le pagine
  const navigate = useNavigate();
  // Hook personalizzato per la gestione del login
  const { login, loading: signLoading } = useLogin();
  // Hook personalizzato per la gestione della registrazione
  const { register, loading: registerLoading } = useRegister();
  // Hook per la gestione delle traduzioni
  const { t } = useTranslation('translation', { keyPrefix: 'login' });
  // Stato per indicare se è in corso un'operazione di login o registrazione
  const loading = signLoading || registerLoading;
  const { config } = useSystemConfig();
  const registerEnabled = config?.registerEnabled !== 0;

  // Funzione per cambiare il titolo tra "login" e "register"
  const changeTitle = () => {
    if (title === 'login' && !registerEnabled) {
      return;
    }
    setTitle((title) => (title === 'login' ? 'register' : 'login'));
  };
  // Hook per la gestione del form di Ant Design
  const [form] = Form.useForm();

  // Effetto collaterale che esegue la validazione del campo "nickname" quando il form viene creato
  useEffect(() => {
    form.validateFields(['nickname']);
  }, [form]);

  // Funzione asincrona chiamata quando si preme il pulsante di login o registrazione
  const onCheck = async () => {
    try {
      // Valida i campi del form e ottiene i valori
      const params = await form.validateFields();
      // Ottiene l'email e rimuove gli spazi bianchi iniziali e finali
      const email = `${params.email}`.trim();

      // Blocco di controllo sull'email specifica
      //if (email !== 'giovanni.pitton@mekosrl.it') {
        // Se l'email non corrisponde a quella consentita, mostra un messaggio di errore
      //  message.error('Accesso non consentito');
      //  return; // Interrompe l'esecuzione della funzione
      //}

      // Cripta la password utilizzando la funzione rsaPsw
      const rsaPassWord = rsaPsw(params.password) as string;

      // Se il titolo è "login", esegue la login
      if (title === 'login') {
        // Chiama la funzione di login con email e password criptata
        const code = await login({
          email,
          password: rsaPassWord,
        });
        // Se il codice restituito è 0 (successo), naviga alla pagina "/knowledge"
        if (code === 0) {
          navigate('/knowledge');
        }
      } else {
        // Se il titolo è "register", esegue la registrazione
        // Chiama la funzione di registrazione con nickname, email e password criptata
        const code = await register({
          nickname: params.nickname,
          email,
          password: rsaPassWord,
        });
        // Se il codice restituito è 0 (successo), imposta il titolo su "login" per mostrare il form di login
        if (code === 0) {
          setTitle('login');
        }
      }
    } catch (errorInfo) {
      // In caso di errore nella validazione o nelle chiamate API, logga l'errore
      console.log('Failed:', errorInfo);
    }
  };

  // Layout per gli elementi del form (label a sinistra)
  const formItemLayout = {
    labelCol: { span: 6 },
  };

  // Funzione per reindirizzare l'utente alla pagina di login di Google (tramite Github OAuth)
  const toGoogle = () => {
    window.location.href =
      'https://github.com/login/oauth/authorize?scope=user:email&client_id=302129228f0d96055bee';
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginLeft}>
        <div className={styles.leftContainer}>
          <div className={styles.loginTitle}>
            <div>{title === 'login' ? t('login') : t('register')}</div>
            <span>
              {title === 'login'
                ? t('loginDescription')
                : t('registerDescription')}
            </span>
          </div>

          <Form
            form={form}
            layout="vertical"
            name="dynamic_rule"
            style={{ maxWidth: 600 }}
          >
            <Form.Item
              {...formItemLayout}
              name="email"
              label={t('emailLabel')}
              rules={[{ required: true, message: t('emailPlaceholder') }]}
            >
              <Input size="large" placeholder={t('emailPlaceholder')} />
            </Form.Item>
            {title === 'register' && (
              <Form.Item
                {...formItemLayout}
                name="nickname"
                label={t('nicknameLabel')}
                rules={[{ required: true, message: t('nicknamePlaceholder') }]}
              >
                <Input size="large" placeholder={t('nicknamePlaceholder')} />
              </Form.Item>
            )}
            <Form.Item
              {...formItemLayout}
              name="password"
              label={t('passwordLabel')}
              rules={[{ required: true, message: t('passwordPlaceholder') }]}
            >
              <Input.Password
                size="large"
                placeholder={t('passwordPlaceholder')}
                onPressEnter={onCheck}
              />
            </Form.Item>
            {title === 'login' && (
              <Form.Item name="remember" valuePropName="checked">
                <Checkbox>{t('rememberMe')}</Checkbox>
              </Form.Item>
            )}
            <div>
              {title === 'login' && registerEnabled && (
                <div>
                  {t('signInTip')}
                  <Button type="link" onClick={changeTitle}>
                    {t('signUp')}
                  </Button>
                </div>
              ) : (
                <div>
                  {t('signUpTip')}
                  <Button type="link" onClick={changeTitle}>
                    {t('login')}
                  </Button>
                </div>
              )}
            </div>
            <Button
              type="primary"
              block
              size="large"
              onClick={onCheck}
              loading={loading}
            >
              {title === 'login' ? t('login') : t('continue')}
            </Button>
            {title === 'login' && (
              <>
                {location.host === Domain && (
                  <Button
                    block
                    size="large"
                    onClick={toGoogle}
                    style={{ marginTop: 15 }}
                  >
                    <div className="flex items-center">
                      <Icon
                        icon="local:github"
                        style={{ verticalAlign: 'middle', marginRight: 5 }}
                      />
                      Sign in with Github
                    </div>
                  </Button>
                )}
              </>
            )}
          </Form>
        </div>
      </div>
      <div className={styles.loginRight}>
        <RightPanel />
      </div>
    </div>
  );
};

export default Login;