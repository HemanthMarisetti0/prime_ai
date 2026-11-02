import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useAuth } from './auth/useAuth';
import { LoginScreen } from './components/LoginScreen';
import './index.css';

/** Shows the sign-in screen until Firebase confirms a user (skipped when sign-in is disabled). */
function Root() {
  const { user, status, error, signIn, signOut } = useAuth();

  if (status === 'loading' || status === 'signed-out') {
    return <LoginScreen loading={status === 'loading'} error={error} onSignIn={signIn} />;
  }

  const account = user ? { name: user.displayName ?? user.email ?? 'Sir', email: user.email ?? '', photoURL: user.photoURL } : null;
  return <App account={account} onSignOut={signOut} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
