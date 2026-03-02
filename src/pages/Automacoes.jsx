import React, { useState } from 'react';
import Header from '../components/Header';
import { useTheme } from '../context/ThemeContext';

export default function Automacoes() {
    const { theme } = useTheme();
    // Simulate initial state (this could be from barbershops table in the future)
    const [toggles, setToggles] = useState({
        reminder: true,
        feedback: false,
        noshow: true,
    });

    const handleToggle = (key) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950">
            <Header title="Automações" subtitle="Gerencie os disparos automáticos para seus clientes via WhatsApp" />

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-white mb-2">Automações de WhatsApp</h2>
                        <p className="text-slate-400">Gerencie os disparos automáticos para seus clientes.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Lembrete de Agendamento */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col relative overflow-hidden group">
                            {/* Decorative background blur */}
                            <div className={`absolute top-0 right-0 w-32 h-32 ${theme.bg} opacity-5 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity duration-300 ${toggles.reminder ? 'opacity-20' : 'opacity-0'}`} />

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${toggles.reminder ? `${theme.bg} text-white` : 'bg-slate-800 text-slate-500'}`}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <button
                                    onClick={() => handleToggle('reminder')}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${toggles.reminder ? theme.bg : 'bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${toggles.reminder ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold text-white mb-2">Lembrete de Agendamento</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    Envia uma mensagem de aviso 1 hora antes do corte para evitar atrasos e esquecimentos.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-md ${toggles.reminder ? `${theme.text} ${theme.bgLight}` : 'text-slate-500 bg-slate-800'}`}>
                                    {toggles.reminder ? 'Ativo' : 'Inativo'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">Gatilho: -1 Hora</span>
                            </div>
                        </div>

                        {/* Pesquisa de Satisfação */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col relative overflow-hidden group">
                            <div className={`absolute top-0 right-0 w-32 h-32 ${theme.bg} opacity-5 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity duration-300 ${toggles.feedback ? 'opacity-20' : 'opacity-0'}`} />

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${toggles.feedback ? `${theme.bg} text-white` : 'bg-slate-800 text-slate-500'}`}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                </div>
                                <button
                                    onClick={() => handleToggle('feedback')}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${toggles.feedback ? theme.bg : 'bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${toggles.feedback ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold text-white mb-2">Pesquisa de Satisfação</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    Pede avaliação do cliente 4 horas após o atendimento, ajudando a ranquear a barbearia.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-md ${toggles.feedback ? `${theme.text} ${theme.bgLight}` : 'text-slate-500 bg-slate-800'}`}>
                                    {toggles.feedback ? 'Ativo' : 'Inativo'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">Gatilho: +4 Horas</span>
                            </div>
                        </div>

                        {/* Recuperação de Faltas */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col relative overflow-hidden group">
                            <div className={`absolute top-0 right-0 w-32 h-32 ${theme.bg} opacity-5 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity duration-300 ${toggles.noshow ? 'opacity-20' : 'opacity-0'}`} />

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${toggles.noshow ? `${theme.bg} text-white` : 'bg-slate-800 text-slate-500'}`}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <button
                                    onClick={() => handleToggle('noshow')}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${toggles.noshow ? theme.bg : 'bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${toggles.noshow ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold text-white mb-2">Recuperação de Faltas</h3>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    Aborda o cliente automaticamente assim que marcado como "Não Compareceu" para reagendar.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-md ${toggles.noshow ? `${theme.text} ${theme.bgLight}` : 'text-slate-500 bg-slate-800'}`}>
                                    {toggles.noshow ? 'Ativo' : 'Inativo'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">Gatilho: Imediato</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
