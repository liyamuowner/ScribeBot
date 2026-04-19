import axios from 'axios';
import { auth } from '../firebase/firebaseConfig';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
});

// Helper to wait for Firebase Auth to initialize
const waitForAuth = () => {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

api.interceptors.request.use(async (config) => {
  // Wait for Firebase to be ready if it's not yet determined
  await auth.authStateReady();
  
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      console.error('Failed to get Firebase ID token', err);
    }
  }
  return config;
});

export default api;


