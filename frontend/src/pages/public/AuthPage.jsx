import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import Logo from '../../components/Logo';

const AuthPage = () => {
  const [tab, setTab] = useState('login'); // 'login' | 'register' | 'forgot'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'beginner_reader' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, googleLogin, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login({ email: form.email, password: form.password });
        navigate('/dashboard');
      } else if (tab === 'register') {
        if (form.password !== form.confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        await register({ name: form.name, email: form.email, password: form.password, role: form.role });
        navigate('/dashboard');
      } else if (tab === 'forgot') {
        const email = form.email.trim().toLowerCase();
        
        // Secure backend check for user existence
        const { data } = await api.post('/auth/check-email', { email });
        
        if (!data.exists) {
          setError('No account found with this email.');
          return;
        }

        await resetPassword(email);
        setSuccess('Password reset link sent to your email.');
        setTimeout(() => setTab('login'), 3000);
      }
    } catch (err) {
      const fbMsg = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'Email already exists.',
        'auth/weak-password': 'Password too weak.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      };
      setError(fbMsg[err.code] || err.response?.data?.message || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await googleLogin();
      navigate('/dashboard');
    } catch (err) {
      setError('Google login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex items-center justify-between px-2">
          <Link to="/" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors dark:hover:text-white">
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <Logo showText={false} />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl md:rounded-[2.5rem] glass-theme p-6 md:p-10 shadow-2xl border border-white/20"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              {tab === 'login' ? 'Welcome Back' : tab === 'register' ? 'Create Account' : 'Reset Access'}
            </h1>
            <p className="mt-2 text-xs md:text-sm font-medium text-slate-400">
              {tab === 'login' ? 'Enter your details to sign in.' : tab === 'register' ? 'Start your journey with us.' : 'Enter email to reset password.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode='wait'>
              {tab === 'register' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required className="w-full rounded-2xl bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold border-none transition-all dark:bg-slate-800 dark:text-white" placeholder="Your Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input required type="email" className="w-full rounded-2xl bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold border-none transition-all dark:bg-slate-800 dark:text-white" placeholder="name@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            {tab !== 'forgot' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                  {tab === 'login' && (
                    <button type="button" onClick={() => setTab('forgot')} className="text-[9px] font-black uppercase text-brand-600 hover:underline">Forgot?</button>
                  )}
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input required type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full rounded-2xl bg-slate-50 py-4 pl-12 pr-12 text-sm font-bold border-none transition-all dark:bg-slate-800 dark:text-white" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <AnimatePresence mode='wait'>
              {tab === 'register' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Confirm Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required type={showPassword ? "text" : "password"} placeholder="••••••••" className="w-full rounded-2xl bg-slate-50 py-4 pl-12 pr-12 text-sm font-bold border-none transition-all dark:bg-slate-800 dark:text-white" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 text-center bg-rose-50 py-2 rounded-xl dark:bg-rose-500/10">{error}</p>}
            {success && <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 text-center bg-emerald-50 py-2 rounded-xl dark:bg-emerald-500/10">{success}</p>}

            <button type="submit" disabled={loading} className="flex w-full h-14 items-center justify-center gap-3 rounded-2xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white shadow-xl hover:bg-brand-600 transition-all disabled:opacity-50 dark:bg-brand-600">
              {loading ? 'Processing...' : tab === 'login' ? 'Sign In' : tab === 'register' ? 'Sign Up' : 'Reset Password'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {tab !== 'forgot' && (
            <div className="mt-8">
              <div className="relative flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Or continue with</span>
                <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
              </div>
              <button onClick={handleGoogle} disabled={loading} className="flex w-full items-center justify-center gap-4 rounded-xl border border-slate-100 h-14 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all dark:border-white/5 dark:text-slate-400 dark:hover:bg-white/5">
                <img src="https://www.google.com/favicon.ico" alt="" className="h-4 w-4" />
                Google Account
              </button>
            </div>
          )}
        </motion.div>

        <p className="mt-8 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">
          {tab === 'login' ? "New Here? " : tab === 'forgot' ? "Back to center? " : "Joined already? "}
          <button onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }} className="font-black text-slate-900 underline underline-offset-4 hover:text-brand-600 dark:text-white uppercase text-[10px]">
            {tab === 'login' ? 'Create Account' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;


