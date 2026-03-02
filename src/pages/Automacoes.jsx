import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_MESSAGES = {
    reminder: "Olá {{cliente}}, seu horário com {{barbeiro}} está próximo! Falta cerca de 1 hora.",
    feedback: "Olá {{cliente}}, o que achou do seu corte com {{barbeiro}}? Avalie nosso serviço!",
    noshow: "Poxa {{cliente}}, sentimos sua falta hoje. Quer remarcar seu horário com {{barbeiro}}?",
};

export default function Automacoes() {
    const { theme } = useTheme();
    const [toggles, setToggles] = useState({
        reminder: true,
        feedback: false,
        noshow: true,
    });

    // Config messages state
    const [messages, setMessages] = useState(DEFAULT_MESSAGES);
    const [openConfig, setOpenConfig] = useState(null); // 'reminder', 'feedback', 'noshow'
    const textRef = useRef(null);

    useEffect(() => {
        const saved = localStorage.getItem('@thebarbers/automation_messages');
        if (saved) {
            setMessages(JSON.parse(saved));
        }
        const savedToggles = localStorage.getItem('@thebarbers/automation_toggles');
        if (savedToggles) {
            setToggles(JSON.parse(savedToggles));
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('@thebarbers/automation_messages', JSON.stringify(messages));
        localStorage.setItem('@thebarbers/automation_toggles', JSON.stringify(toggles));
        alert('Configurações salvas localmente!');
    };

    const handleToggle = (key) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleMessageChange = (key, value) => {
        setMessages(prev => ({ ...prev, [key]: value }));
    };

    const insertVariable = (key, variable) => {
        const el = textRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = messages[key] || '';
        const newText = text.substring(0, start) + variable + text.substring(end);
        setMessages(prev => ({ ...prev, [key]: newText }));

        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
    };

    const renderCard = (key, title, desc, iconPath, gatilho) => {
        const isActive = toggles[key];
        const isConfigOpen = openConfig === key;

        return (
            <div className={`bg-slate-900 border ${isConfigOpen ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'} rounded-2xl flex flex-col relative group mb-6 transition-all duration-300`}>
                <div className={`absolute top-0 right-0 w-32 h-32 ${theme.bg} opacity-5 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity duration-300 ${isActive ? 'opacity-20' : 'opacity-0'}`} />

                <div className="p-6 relative z-10 lg:h-52 flex flex-col justify-between">
                    <div>
                        <div className="flex items-start justify-between mb-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${isActive ? `${theme.bg} text-white` : 'bg-slate-800 text-slate-500'}`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                                </svg>
                            </div>
                            <button
                                onClick={() => handleToggle(key)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isActive ? theme.bg : 'bg-slate-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-md w-max ${isActive ? `${theme.text} ${theme.bgLight}` : 'text-slate-500 bg-slate-800'}`}>
                                {isActive ? 'Ativo' : 'Inativo'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">Gatilho: {gatilho}</span>
                        </div>
                        <button
                            onClick={() => setOpenConfig(isConfigOpen ? null : key)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border ${isConfigOpen ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'}`}
                        >
                            {isConfigOpen ? 'Fechar Editor' : 'Configurar'}
                        </button>
                    </div>
                </div>

                {isConfigOpen && (
                    <div className="border-t border-slate-800 bg-slate-900/80 p-6 relative rounded-b-2xl z-10 transition-all duration-300">
                        <label className="text-sm font-semibold text-slate-300 block mb-1">Mensagem do WhatsApp</label>
                        <p className="text-xs text-slate-500 mb-4">Clique nas variáveis abaixo para inserir dinamicamente na mensagem.</p>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <button onClick={() => insertVariable(key, '{{cliente}}')} className="text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded hover:bg-emerald-500/20 transition-colors">{'{{cliente}}'}</button>
                            <button onClick={() => insertVariable(key, '{{barbeiro}}')} className="text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded hover:bg-blue-500/20 transition-colors">{'{{barbeiro}}'}</button>
                            <button onClick={() => insertVariable(key, '{{data_hora}}')} className="text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded hover:bg-purple-500/20 transition-colors">{'{{data_hora}}'}</button>
                            <button onClick={() => insertVariable(key, '{{barbearia}}')} className="text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors">{'{{barbearia}}'}</button>
                        </div>

                        <textarea
                            ref={openConfig === key ? textRef : null}
                            value={messages[key]}
                            onChange={(e) => handleMessageChange(key, e.target.value)}
                            rows={4}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none leading-relaxed"
                            placeholder="Digite a mensagem aqui..."
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Header title="Automações" subtitle="Gerencie os disparos automáticos para seus clientes via WhatsApp" />

                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center justify-between mb-8 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">Automações de WhatsApp</h2>
                                <p className="text-slate-400 text-sm">Configure regras e mensagens para disparos automáticos integrados via n8n.</p>
                            </div>
                            <button
                                onClick={handleSave}
                                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${theme.bg} text-white hover:brightness-110 flex items-center gap-2`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                Salvar Tudo
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 items-start">
                            {renderCard(
                                'reminder',
                                'Lembrete de Agendamento',
                                'Envia uma mensagem de aviso 1 hora antes do corte para evitar atrasos e esquecimentos.',
                                'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
                                '-1 Hora'
                            )}
                            {renderCard(
                                'feedback',
                                'Pesquisa de Satisfação',
                                'Pede avaliação do cliente 4 horas após o atendimento, ajudando a ranquear a barbearia.',
                                'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
                                '+4 Horas'
                            )}
                            {renderCard(
                                'noshow',
                                'Recuperação de Faltas',
                                'Aborda o cliente automaticamente assim que marcado como "Não Compareceu" para reagendar.',
                                'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
                                'Imediato'
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

