'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/app/utils/supabase/client';

export type UserProfile = {
  id: number;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  auth_id: string;
};

type AuthContextType = {
  session: Session | null;  
  user: User | null;        
  profile: UserProfile | null;
  loading: boolean;       
};


const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
});


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(authId: string) {
    const { data, error } = await supabase
      .from('People')
      .select('id, name, role, auth_id')
      .eq('auth_id', authId)
      .single();

    if (error) {
      console.error('Could not fetch profile:', error.message);
      setProfile(null);
    } else {
      setProfile(data as UserProfile);
    }
  }

  useEffect(() => {
    // On first load: check if there's already a session 
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // User is already logged in 
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        // No session stop loading and show login form
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
