import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  auth_user_id: string;
  role: "admin" | "driver";
  driver_id: string | null;
}

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  status: string;
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, profile: null, driver: null,
  loading: true, isAdmin: false, isDriver: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    // Fetch the user_profiles row
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!profileData) {
      // First login — create a default driver profile
      const { data: newProfile } = await supabase
        .from("user_profiles")
        .insert({ auth_user_id: userId, role: "driver" })
        .select()
        .single();
      setProfile(newProfile as UserProfile ?? null);
      setDriver(null);
      return;
    }

    setProfile(profileData as UserProfile);

    // If driver role, fetch the linked drivers row
    if (profileData.driver_id) {
      const { data: driverData } = await supabase
        .from("drivers")
        .select("id, name, phone, status, approved_at, created_at")
        .eq("id", profileData.driver_id)
        .maybeSingle();
      setDriver(driverData as Driver ?? null);
    } else {
      setDriver(null);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
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
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, driver, loading,
      isAdmin: profile?.role === "admin",
      isDriver: profile?.role === "driver",
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
