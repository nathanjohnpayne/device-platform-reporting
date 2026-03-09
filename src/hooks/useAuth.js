// hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, isAllowedEmail } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied]   = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        if (isAllowedEmail(u.email)) {
          setUser(u);
          setDenied(false);
        } else {
          // Sign out immediately — wrong domain
          await signOut(auth);
          setUser(null);
          setDenied(true);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    setDenied(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Sign-in error', e);
    }
  };

  const signOutUser = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, denied, signIn, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
