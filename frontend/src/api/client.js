import axios from 'axios';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
});

// Helper to wait for Firebase Auth to initialize
const waitForAuth = () => {
  return new Promise((resolve) => {
    if (auth.currentUser !== null) return resolve(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

api.interceptors.request.use(async (config) => {
  // Wait for Firebase to be ready if it's not yet determined
main
  if (auth) {
    await auth.authStateReady();
    
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (err) {
        console.error('Failed to get Firebase ID token', err);
      }
=======
  await waitForAuth();
  
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      console.error('Failed to get Firebase ID token', err);
main
    }
  }
  return config;
});

export default api;


