import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/firebaseConfig';
import api from '../api/client';
import { useTheme } from './ThemeContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [auth_state, setAuthState] = useState(() =>
    JSON.parse(localStorage.getItem('liyamu-auth') || 'null')
  );
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const { setTheme } = useTheme();

  // Persist platform auth to localStorage
  useEffect(() => {
    if (auth_state) {
      localStorage.setItem('liyamu-auth', JSON.stringify(auth_state));
    } else {
      localStorage.removeItem('liyamu-auth');
    }
  }, [auth_state]);

  // Sync theme from stored auth
  useEffect(() => {
    if (auth_state?.settings?.theme && setTheme) {
      setTheme(auth_state.settings.theme);
    }
  }, [auth_state?.settings?.theme]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Register with email/password.
   * 1. Creates Firebase Auth user
   * 2. Sends Firebase ID token to backend → backend creates Firestore user doc
   */
  const register = async (payload) => {
    setLoading(true);
    try {
      const { name, email, password, role } = payload;

      // Step 1: Create Firebase Auth user
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = credential.user;

      // Step 2: Set display name
      await updateProfile(fbUser, { displayName: name });

      // Step 3: Get ID token and send to backend
      const idToken = await fbUser.getIdToken();
      const { data } = await api.post('/auth/register', { name, role, idToken });

      setAuthState(data);
      return data;
    } catch (err) {
      // If backend fails, clean up Firebase Auth user
      if (auth.currentUser) {
        await auth.currentUser.delete().catch(() => {});
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Login with email/password.
   * 1. Firebase sign-in → get ID token
   * 2. Backend verifies token and returns Firestore user data
   */
  const login = async (payload) => {
    setLoading(true);
    try {
      const { email, password } = payload;

      // Step 1: Firebase sign-in
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      // Step 2: Backend login — verifies token, returns user data
      const { data } = await api.post('/auth/login', { idToken });
      setAuthState(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Google OAuth login via Firebase popup.
   */
  const googleLogin = async (role = 'beginner_reader') => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const idToken = await fbUser.getIdToken();

      const { data } = await api.post('/auth/social-login', {
        name: fbUser.displayName,
        role,
        idToken,
        provider: 'google',
      });

      setAuthState(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Legacy social login shim (keeps backward compatibility)
   */
  const socialLogin = async (payload) => {
    // If idToken is already present, forward directly
    if (payload.idToken) {
      const { data } = await api.post('/auth/social-login', payload);
      setAuthState(data);
      return data;
    }
    // Otherwise use Google popup
    return googleLogin(payload.role);
  };

  /**
   * Logout from both Firebase and platform
   */
  const logout = async () => {
    try { await signOut(auth); } catch { /* ignore */ }
    setAuthState(null);
    setFirebaseUser(null);
  };

  /**
   * Fetch user role from Firestore
   */
  const getFirestoreRole = async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) return snap.data().role;
    } catch { /* silent */ }
    return null;
  };

  /**
   * Refresh the stored auth state from backend (for role updates etc.)
   */
  const refreshAuth = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken(true); // force refresh
      const { data } = await api.post('/auth/login', { idToken });
      setAuthState(data);
      return data;
    } catch (e) {
      console.error('Failed to refresh auth:', e);
    }
  };

  /**
   * Reset password via email
   */
  const resetPassword = async (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const value = useMemo(
    () => ({
      auth: auth_state,
      setAuth: setAuthState,
      firebaseUser,
      login,
      register,
      socialLogin,
      googleLogin,
      logout,
      getFirestoreRole,
      refreshAuth,
      resetPassword,
      loading,
    }),
    [auth_state, firebaseUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
