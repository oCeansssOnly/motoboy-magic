import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  auth_user_id: string;
  role: "admin" | "driver";
  driver_id: string | null;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  notes?: string | null;
  approved_at: string | null;
  created_at: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  driver: Driver | null;
  loading: boolean;
  isAdmin: boolean;
  isDriver: boolean;
  isApproved: boolean; // admin OR active driver
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, profile: null, driver: null,
  loading: true, isAdmin: false, isDriver: false, isApproved: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!profileData) {
      // No profile yet — AuthGate will create it after signup
      setProfile(null);
      setDriver(null);
      return;
    }

    setProfile(profileData as UserProfile);

    if (profileData.driver_id) {
      const { data: driverData } = await supabase
        .from("drivers")
        .select("id, name, phone, status, notes, approved_at, created_at")
        .eq("id", profileData.driver_id)
        .maybeSingle();
      setDriver((driverData as Driver) ?? null);
    } else {
      setDriver(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setDriver(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const isAdmin = profile?.role === "admin";
  const isDriver = profile?.role === "driver";
  const isApproved = isAdmin || (isDriver && driver?.status === "active");

  return (
    <AuthContext.Provider value={{
      user, session, profile, driver, loading,
      isAdmin, isDriver, isApproved,
      signOut: async () => { await supabase.auth.signOut(); },
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
