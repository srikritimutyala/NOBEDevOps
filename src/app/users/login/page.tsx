import { Suspense } from 'react';
import LoginForm from './login';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><div className="auth-card"><p className="section-copy">Loading...</p></div></div>}>
      <LoginForm />
    </Suspense>
  );
}
