import { useAuth } from '@/hooks/auth-hooks';
import { redirectToLogin } from '@/utils/authorization-util';
import { Outlet, useLocation } from 'umi';

export default () => {
  const { isLogin } = useAuth();
  const location = useLocation();
  const publicPaths = ['/login', '/login-page'];

  if (isLogin === true) {
    return <Outlet />;
  } else if (isLogin === false) {
    if (!publicPaths.includes(location.pathname)) {
      redirectToLogin();
      return <></>;
    } else {
      // Se siamo su una pagina pubblica, non forziamo il redirect
      return <Outlet />;
    }
  }

  return <></>;
};
