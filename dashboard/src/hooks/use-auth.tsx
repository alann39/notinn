import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/types/user";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSigningOut: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.rpc("web_get_profile");
      if (!error && data && data.length > 0) {
        setProfile(data[0] as UserProfile);
      }
    } catch {
      // Ignore background profile fetch errors
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        fetchProfile();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);
        if (s) {
          fetchProfile();
        } else {
          setProfile(null);
          if (event === "SIGNED_OUT") {
            window.location.replace("/");
          }
        }
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setProfile(null);
      window.location.replace("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        isSigningOut,
        signOut,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
