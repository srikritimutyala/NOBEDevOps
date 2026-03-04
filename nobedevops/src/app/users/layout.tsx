import { AuthProvider } from './authprovider';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
