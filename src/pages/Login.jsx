import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

/**
 * Login page for The Barbers application.
 * Follows the brand design system: --brand-red, --brand-black, --brand-surface.
 */
export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    
    const navigate = useNavigate();
    const location = useLocation();
    
    // Where to redirect after login
    const from = location.state?.from?.pathname || "/dashboard";

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            toast.success('Login realizado com sucesso!');
            navigate(from, { replace: true });
        } catch (error) {
            console.error('Erro no login:', error.message);
            toast.error(error.message === 'Invalid login credentials' 
                ? 'E-mail ou senha incorretos.' 
                : `Erro ao entrar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md">
                {/* Logo Area */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#0f0f0f] border border-white/5 shadow-2xl mb-6">
                        <svg className="w-12 h-12 text-[#dc2626]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">The Barbers</h1>
                    <p className="text-slate-500 text-sm mt-2 font-medium tracking-wide">PAINEL ADMINISTRATIVO</p>
                </div>

                {/* Login Card */}
                <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    {/* Subtle Brand Accent */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#dc2626] to-transparent opacity-50" />
                    
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">E-mail</label>
                            <input 
                                type="email" 
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-5 py-3.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#dc2626]/50 focus:ring-1 focus:ring-[#dc2626]/20 transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Senha</label>
                            <input 
                                type="password" 
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-5 py-3.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#dc2626]/50 focus:ring-1 focus:ring-[#dc2626]/20 transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-red-900/10 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>ENTRAR NO SISTEMA</span>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center">
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Acesso Restrito</p>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <p className="text-[10px] text-slate-700 font-medium select-none">© 2026 THE BARBERS. TODOS OS DIREITOS RESERVADOS.</p>
                </div>
            </div>
        </div>
    );
}
