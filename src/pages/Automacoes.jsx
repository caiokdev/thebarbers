import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabaseClient';

const DEFAULT_MESSAGES = {
    reminder: "Olá {{cliente}}, seu horário com {{barbeiro}} está próximo! Falta cerca de 1 hora.",
    feedback: "Olá {{cliente}}, o que achou do serviço? Avalie a gente!",
    noshow: "Poxa {{cliente}}, sentimos sua falta hoje. Quer remarcar seu horário com {{barbeiro}}?",
    rebook: "E aí {{cliente}}, curtiu o corte? Já quer deixar o próximo garantido?",
};

export default function Automacoes() {
    const { theme } = useTheme();
    const [toggles, setToggles] = useState({
        reminder: true,
        feedback: false,
        noshow: true,
        rebook: false,
    });

    // Config messages state
    const [messages, setMessages] = useState(DEFAULT_MESSAGES);
    const [openConfig, setOpenConfig] = useState(null); // 'reminder', 'feedback', 'noshow'
    const textRef = useRef(null);

    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Failed logs state
    const [failedLogs, setFailedLogs] = useState([]);

    useEffect(() => {
        async function fetchSettings() {
            setLoading(true);
            try {
                const { data: shop, error } = await supabase
                    .from('barbershops')
                    .select('id, reminder_active, reminder_msg, feedback_active, feedback_msg, noshow_active, noshow_msg, rebook_active, rebook_msg')
                    .limit(1)
                    .single();

                if (error) throw error;
                if (shop) {
                    setBarbershopId(shop.id);
                    setToggles({
                        reminder: shop.reminder_active ?? true,
                        feedback: shop.feedback_active ?? false,
                        noshow: shop.noshow_active ?? true,
                        rebook: shop.rebook_active ?? false,
                    });
                    setMessages({
                        reminder: shop.reminder_msg ?? DEFAULT_MESSAGES.reminder,
                        feedback: shop.feedback_msg ?? DEFAULT_MESSAGES.feedback,
                        noshow: shop.noshow_msg ?? DEFAULT_MESSAGES.noshow,
                        rebook: shop.rebook_msg ?? DEFAULT_MESSAGES.rebook,
                    });
                }
            } catch (error) {
                console.error('Erro ao buscar automações:', error);
            } finally {
                setLoading(false);
            }
        }


        fetchSettings();
    }, []);

    // Fetch Failed Logs separately (depends on barbershopId)
    useEffect(() => {
        async function fetchFailedLogs() {
            if (!barbershopId) return;
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('id, scheduled_at, reminder_failed, reminder_error_log, noshow_failed, noshow_error_log, feedback_failed, feedback_error_log, rebook_failed, rebook_error_log, clients(name, phone), professionals(name)')
                    .eq('barbershop_id', barbershopId)
                    .or('reminder_failed.eq.true,noshow_failed.eq.true,feedback_failed.eq.true,rebook_failed.eq.true')
                    .order('scheduled_at', { ascending: false });

                if (error) throw error;
                setFailedLogs(data || []);
            } catch (error) {
                console.error('Erro ao buscar falhas:', error);
            }
        }
        fetchFailedLogs();
    }, [barbershopId]);

    const handleSave = async () => {
        if (!barbershopId) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('barbershops')
                .update({
                    reminder_active: toggles.reminder,
                    reminder_msg: messages.reminder,
                    feedback_active: toggles.feedback,
                    feedback_msg: messages.feedback,
                    noshow_active: toggles.noshow,
                    noshow_msg: messages.noshow,
                    rebook_active: toggles.rebook,
                    rebook_msg: messages.rebook,
                })
                .eq('id', barbershopId);

            if (error) throw error;
            alert('Automações salvas com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar automações:', error);
            alert('Erro ao salvar automações. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const generateWhatsAppLink = (log) => {
        const phone = log.clients?.phone?.replace(/\D/g, '');
        if (!phone) return '#';

        let baseMsg = "Olá {{cliente}}, seu horário com {{barbeiro}} está próximo!";
        if (log.rebook_failed) {
            baseMsg = messages.rebook || DEFAULT_MESSAGES.rebook;
            const msg = baseMsg.replace(/\{\{cliente\}\}/g, log.clients?.name?.split(' ')[0] || 'Cliente');
            return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        } else if (log.feedback_failed) {
            baseMsg = messages.feedback || "Olá {{cliente}}, o que achou do serviço? Avalie a gente!";
            const msg = baseMsg.replace(/\{\{cliente\}\}/g, log.clients?.name?.split(' ')[0] || 'Cliente');
            return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        } else if (log.noshow_failed) {
            baseMsg = messages.noshow || "Poxa {{cliente}}, sentimos sua falta hoje. Quer remarcar seu horário com {{barbeiro}}?";
        } else if (log.reminder_failed) {
            baseMsg = messages.reminder || "Olá {{cliente}}, seu horário com {{barbeiro}} está próximo! Falta cerca de 1 hora.";
        }

        const date = new Date(log.scheduled_at);

        const formattedDate = date.toLocaleDateString('pt-BR');
        const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dataHoraStr = `${formattedDate} às ${formattedTime}`;

        const msg = baseMsg
            .replace(/\{\{cliente\}\}/g, log.clients?.name?.split(' ')[0] || 'Cliente')
            .replace(/\{\{barbeiro\}\}/g, log.professionals?.name?.split(' ')[0] || 'Barbeiro')
            .replace(/\{\{data_hora\}\}/g, dataHoraStr)
            .replace(/\{\{barbearia\}\}/g, 'nossa barbearia'); // genérico para caso tenha a tag

        const encodedMsg = encodeURIComponent(msg);
        return `https://wa.me/55${phone}?text=${encodedMsg}`;
    };

    const handleResolveError = async (orderId) => {
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    reminder_failed: false,
                    reminder_error_log: null,
                    noshow_failed: false,
                    noshow_error_log: null,
                    feedback_failed: false,
                    feedback_error_log: null,
                    rebook_failed: false,
                    rebook_error_log: null
                })
                .eq('id', orderId);
            if (error) throw error;
            setFailedLogs(prev => prev.filter(o => o.id !== orderId));
        } catch (error) {
            console.error("Erro ao resolver falha", error);
            alert("Erro ao resolver falha no banco.");
        }
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
            <div className={`bg-slate-900 border ${isConfigOpen ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'} rounded-2xl flex flex-col relative group transition-all duration-300 h-full`}>
                <div className={`absolute top-0 right-0 w-32 h-32 ${theme.bg} opacity-5 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity duration-300 ${isActive ? 'opacity-20' : 'opacity-0'}`} />

                <div className="p-6 relative z-10 flex flex-col flex-1 h-full">
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

                    <div className="mt-auto pt-4 border-t border-slate-800/50 flex items-center justify-between">
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
                            {key !== 'feedback' && key !== 'rebook' && (
                                <>
                                    <button onClick={() => insertVariable(key, '{{barbeiro}}')} className="text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded hover:bg-blue-500/20 transition-colors">{'{{barbeiro}}'}</button>
                                    <button onClick={() => insertVariable(key, '{{data_hora}}')} className="text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded hover:bg-purple-500/20 transition-colors">{'{{data_hora}}'}</button>
                                    <button onClick={() => insertVariable(key, '{{barbearia}}')} className="text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors">{'{{barbearia}}'}</button>
                                </>
                            )}
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

    if (loading) {
        return (
            <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4" />
                        <p className="text-slate-500 text-sm">Carregando automações...</p>
                    </div>
                </main>
            </div>
        );
    }

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
                                disabled={saving}
                                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${theme.bg} text-white hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2`}
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {saving ? 'Salvando...' : 'Salvar Tudo'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
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
                            {renderCard(
                                'rebook',
                                'Reagendamento Express',
                                'Aproveita a janela gratuita de 24h do WhatsApp para incentivar o reagendamento de clientes que marcaram e cortaram no mesmo dia.',
                                'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
                                '+23 Horas'
                            )}
                        </div>

                        {/* Seção de Monitoramento de Falhas */}
                        <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Falhas de Envio Recentes</h2>
                                    <p className="text-slate-400 text-sm">Monitore mensagens de WhatsApp que não puderam ser entregues via n8n.</p>
                                </div>
                            </div>

                            {failedLogs.length === 0 ? (
                                <div className="text-center py-8 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                    <p className="text-emerald-400 font-medium tracking-wide">Tudo rodando perfeitamente! Nenhuma falha detectada.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-800/50 rounded-t-xl">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold rounded-tl-xl w-1/4">Cliente</th>
                                                <th className="px-4 py-3 font-semibold w-1/4">Agendamento</th>
                                                <th className="px-4 py-3 font-semibold w-1/3">Erro do n8n</th>
                                                <th className="px-4 py-3 font-semibold text-right rounded-tr-xl w-1/6">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {failedLogs.map(log => {
                                                const date = new Date(log.scheduled_at);
                                                const phone = log.clients?.phone?.replace(/\D/g, '');
                                                return (
                                                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                                                        <td className="px-4 py-4">
                                                            <div className="font-medium text-slate-200">{log.clients?.name || 'Cliente Avulso'}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5">{log.clients?.phone || 'Sem Telefone cadastrado'}</div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {log.reminder_failed && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">Lembrete</span>
                                                                )}
                                                                {log.noshow_failed && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">Falta</span>
                                                                )}
                                                                {log.feedback_failed && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">Pesquisa</span>
                                                                )}
                                                                {log.rebook_failed && (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">Reagendamento</span>
                                                                )}
                                                            </div>
                                                            <div className="text-slate-300">{date.toLocaleDateString('pt-BR')}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5">{date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • com {log.professionals?.name?.split(' ')[0] || 'Barbeiro'}</div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="text-rose-400 text-xs line-clamp-3 leading-relaxed" title={log.rebook_failed ? log.rebook_error_log : log.feedback_failed ? log.feedback_error_log : log.noshow_failed ? log.noshow_error_log : log.reminder_error_log}>
                                                                {log.rebook_failed ? log.rebook_error_log : log.feedback_failed ? log.feedback_error_log : log.noshow_failed ? log.noshow_error_log : log.reminder_error_log || 'Falha desconhecida no webhook de envio.'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <div className="flex justify-end gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                                                                {phone ? (
                                                                    <a href={generateWhatsAppLink(log)} target="_blank" rel="noopener noreferrer" className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors border border-emerald-500/20" title="Enviar mensagem pré-preenchida">
                                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                                    </a>
                                                                ) : null}
                                                                <button onClick={() => handleResolveError(log.id)} className="p-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-700" title="Marcar como Resolvido">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

