import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabaseClient';
import { useGlobalData } from '../context/GlobalDataContext';
import { getLocalDateISO } from '../utils/dateUtils';
import { DEFAULT_MESSAGES } from '../utils/constants';

export default function Automacoes() {
    const { theme } = useTheme();
    const { adminProfile, loading: globalLoading, refreshData } = useGlobalData();
    const barbershopId = adminProfile?.barbershopId;

    const [toggles, setToggles] = useState({
        reminder: true,
        feedback: false,
        noshow: true,
        rebook: false,
        birthday: false,
    });

    // Config messages state
    const [messages, setMessages] = useState(DEFAULT_MESSAGES);
    const [openConfig, setOpenConfig] = useState(null);
    const textRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Dashboard data for birthdays
    const { clients } = useGlobalData();
    const [birthdayModal, setBirthdayModal] = useState({ open: false, title: '', items: [] });
    
    // Compute birthdays synchronously
    const birthdayData = React.useMemo(() => {
        const todayISO = getLocalDateISO(new Date());
        const [tY, tM, tD] = todayISO.split('-').map(Number);
        const localToday = new Date(tY, tM - 1, tD);
        
        // Boundaries para a semana local (domingo a sabado) dependendo da data atual local
        const startOfWeek = new Date(tY, tM - 1, tD - localToday.getDay());
        const endOfWeek = new Date(tY, tM - 1, tD + (6 - localToday.getDay()));
        
        const todos = [];
        const semana = [];
        
        (clients || []).forEach(client => {
            if (!client.birth_date) return;
            const [bY, bMStr, bDStr] = client.birth_date.split('-');
            const bM = parseInt(bMStr);
            const bD = parseInt(bDStr);
            
            if (bM === tM) {
                const bDateThisYear = new Date(tY, bM - 1, bD);
                const isWeek = bDateThisYear >= startOfWeek && bDateThisYear <= endOfWeek;
                
                const dataObj = {
                    nome: client.name,
                    data: `${bDStr}/${bMStr}`,
                    idade: tY - parseInt(bY),
                    phone: client.phone
                };
                
                todos.push(dataObj);
                if (isWeek) semana.push(dataObj);
            }
        });
        
        return {
            aniversariantes: todos.sort((a,b) => parseInt(a.data.split('/')[0]) - parseInt(b.data.split('/')[0])),
            aniversariantesSemana: semana.sort((a,b) => parseInt(a.data.split('/')[0]) - parseInt(b.data.split('/')[0]))
        };
    }, [clients]);

    // Failed logs state
    const [failedLogs, setFailedLogs] = useState([]);

    useEffect(() => {
        async function fetchSettings() {
            if (!barbershopId) return;
            setLoading(true);
            try {
                const { data: shop, error } = await supabase
                    .from('barbershops')
                    .select('id, reminder_active, reminder_msg, feedback_active, feedback_msg, noshow_active, noshow_msg, rebook_active, rebook_msg, birthday_active, birthday_msg')
                    .eq('id', barbershopId)
                    .single();

                if (error) throw error;
                if (shop) {
                    setToggles({
                        reminder: shop.reminder_active ?? true,
                        feedback: shop.feedback_active ?? false,
                        noshow: shop.noshow_active ?? true,
                        rebook: shop.rebook_active ?? false,
                        birthday: shop.birthday_active ?? false,
                    });
                    setMessages({
                        reminder: shop.reminder_msg ?? DEFAULT_MESSAGES.reminder,
                        feedback: shop.feedback_msg ?? DEFAULT_MESSAGES.feedback,
                        noshow: shop.noshow_msg ?? DEFAULT_MESSAGES.noshow,
                        rebook: shop.rebook_msg ?? DEFAULT_MESSAGES.rebook,
                        birthday: shop.birthday_msg ?? DEFAULT_MESSAGES.birthday,
                    });
                }
            } catch (error) {
                console.error('Erro ao buscar automações:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchSettings();
    }, [barbershopId]);

    // Fetch Failed Logs separately (depends on barbershopId)
    useEffect(() => {
        async function fetchFailedLogs() {
            if (!barbershopId) return;
            try {
                const [ordersRes, clientsRes] = await Promise.all([
                    supabase
                        .from('orders')
                        .select('id, scheduled_at, reminder_failed, reminder_error_log, noshow_failed, noshow_error_log, feedback_failed, feedback_error_log, rebook_failed, rebook_error_log, clients(name, phone), professionals(name)')
                        .eq('barbershop_id', barbershopId)
                        .or('reminder_failed.eq.true,noshow_failed.eq.true,feedback_failed.eq.true,rebook_failed.eq.true')
                        .order('scheduled_at', { ascending: false }),
                    supabase
                        .from('clients')
                        .select('id, name, phone, birth_date, birthday_failed, birthday_error_log')
                        .eq('barbershop_id', barbershopId)
                        .eq('birthday_failed', true)
                ]);

                if (ordersRes.error) throw ordersRes.error;
                if (clientsRes.error) throw clientsRes.error;

                const ordersData = (ordersRes.data || []).map(order => ({ ...order, logType: 'order' }));
                const clientsData = (clientsRes.data || []).map(client => ({ ...client, logType: 'client' }));

                const combinedLogs = [...ordersData, ...clientsData].sort((a, b) => {
                    const dateA = new Date(a.scheduled_at || a.birth_date || 0);
                    const dateB = new Date(b.scheduled_at || b.birth_date || 0);
                    return dateB - dateA;
                });

                setFailedLogs(combinedLogs);
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
                    birthday_active: toggles.birthday,
                    birthday_msg: messages.birthday,
                })
                .eq('id', barbershopId);

            if (error) throw error;
            toast.success('Automações salvas com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar automações:', error);
            toast.error('Erro ao salvar automações. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const generateWhatsAppLink = (log) => {
        let phone;
        if (log.logType === 'client') {
            phone = log.phone?.replace(/\D/g, '');
        } else {
            phone = log.clients?.phone?.replace(/\D/g, '');
        }

        if (!phone) return '#';

        let baseMsg = "Olá {{cliente}}, seu horário com {{barbeiro}} está próximo!";
        let clientName = log.logType === 'client' ? (log.name?.split(' ')[0] || 'Cliente') : (log.clients?.name?.split(' ')[0] || 'Cliente');

        if (log.birthday_failed) {
            baseMsg = messages.birthday || DEFAULT_MESSAGES.birthday;
            const msg = baseMsg.replace(/\{\{cliente\}\}/g, clientName);
            return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        } else if (log.rebook_failed) {
            baseMsg = messages.rebook || DEFAULT_MESSAGES.rebook;
            const msg = baseMsg.replace(/\{\{cliente\}\}/g, clientName);
            return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        } else if (log.feedback_failed) {
            baseMsg = messages.feedback || "Olá {{cliente}}, o que achou do serviço? Avalie a gente!";
            const msg = baseMsg.replace(/\{\{cliente\}\}/g, clientName);
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
            .replace(/\{\{cliente\}\}/g, clientName)
            .replace(/\{\{barbeiro\}\}/g, log.professionals?.name?.split(' ')[0] || 'Barbeiro')
            .replace(/\{\{data_hora\}\}/g, dataHoraStr)
            .replace(/\{\{barbearia\}\}/g, 'nossa barbearia'); // genérico para caso tenha a tag

        const encodedMsg = encodeURIComponent(msg);
        return `https://wa.me/55${phone}?text=${encodedMsg}`;
    };

    const handleResolveError = async (logId, logType) => {
        try {
            if (logType === 'client') {
                const { error } = await supabase
                    .from('clients')
                    .update({
                        birthday_failed: false,
                        birthday_error_log: null
                    })
                    .eq('id', logId);
                if (error) throw error;
            } else {
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
                    .eq('id', logId);
                if (error) throw error;
            }
            setFailedLogs(prev => prev.filter(o => o.id !== logId));
        } catch (error) {
            console.error("Erro ao resolver falha", error);
            toast.error("Erro ao resolver falha no banco.");
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
            <div className={`bg-slate-900 border ${isConfigOpen ? 'border-red-600/50 ring-1 ring-red-600/20' : 'border-slate-800'} rounded-2xl flex flex-col relative group transition-all duration-300 h-full`}>
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
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border ${isConfigOpen ? 'text-red-400 bg-red-600/10 border-red-600/20 hover:bg-red-600/20' : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'}`}
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
                            <button onClick={() => insertVariable(key, '{{cliente}}')} className="text-[11px] font-semibold bg-red-600/10 text-red-400 border border-red-600/20 px-2 py-1 rounded hover:bg-red-600/20 transition-colors">{'{'}{'{' + 'cliente' + '}' + '}'}</button>
                            {key !== 'feedback' && key !== 'rebook' && key !== 'birthday' && (
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
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-colors resize-none leading-relaxed"
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
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4" />
                        <p className="text-slate-500 text-sm">Carregando automações...</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch mb-6">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 items-stretch max-w-4xl mx-auto">
                        {renderCard(
                            'rebook',
                            'Reagendamento Express',
                            'Aproveita a janela gratuita de 24h do WhatsApp para incentivar o reagendamento de clientes que marcaram e cortaram no mesmo dia.',
                            'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
                            '+23 Horas'
                        )}
                        {renderCard(
                            'birthday',
                            'Promoção de Aniversário',
                            'Fidelize clientes enviando uma mensagem automática de parabéns com um desconto especial.',
                            'M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z',
                            '-1 Dia'
                        )}
                    </div>

                    {/* --- NOVA SEÇÃO: PRÓXIMOS ANIVERSARIANTES --- */}
                    <div className="mt-12 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`w-10 h-10 rounded-xl ${theme.bgLight} flex items-center justify-center`}>
                                <svg className={`w-5 h-5 ${theme.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Próximos Aniversariantes</h2>
                                <p className="text-slate-400 text-sm">Acompanhe quem está soprando as velinhas e aproveite para fidelizar.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 flex items-center justify-between group hover:border-red-600/30 transition-colors">
                                <div>
                                    <p className="text-sm text-slate-500 mb-1">Aniversariantes da Semana</p>
                                    <h4 className="text-2xl font-bold text-white">{birthdayData.aniversariantesSemana.length}</h4>
                                </div>
                                <button 
                                    onClick={() => setBirthdayModal({ open: true, title: 'Aniversariantes da Semana', items: birthdayData.aniversariantesSemana })}
                                    className="text-xs font-bold text-red-500 bg-red-600/10 px-3 py-1.5 rounded-lg hover:bg-red-600/20 transition-colors"
                                >
                                    Ver Lista
                                </button>
                            </div>
                            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 flex items-center justify-between group hover:border-red-600/30 transition-colors">
                                <div>
                                    <p className="text-sm text-slate-500 mb-1">Aniversariantes do Mês</p>
                                    <h4 className="text-2xl font-bold text-white">{birthdayData.aniversariantes.length}</h4>
                                </div>
                                <button 
                                    onClick={() => setBirthdayModal({ open: true, title: 'Aniversariantes do Mês', items: birthdayData.aniversariantes })}
                                    className="text-xs font-bold text-red-500 bg-red-600/10 px-3 py-1.5 rounded-lg hover:bg-red-600/20 transition-colors"
                                >
                                    Ver Lista
                                </button>
                            </div>
                        </div>
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
                            <div className="text-center py-8 bg-red-600/5 border border-red-600/10 rounded-xl">
                                <p className="text-green-400 font-medium tracking-wide">Tudo rodando perfeitamente! Nenhuma falha detectada.</p>
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
                                            const date = log.logType === 'client' ? new Date(log.birth_date + 'T00:00:00') : new Date(log.scheduled_at);
                                            const phone = log.logType === 'client' ? log.phone?.replace(/\D/g, '') : log.clients?.phone?.replace(/\D/g, '');
                                            const clientName = log.logType === 'client' ? log.name : log.clients?.name;
                                            const clientPhone = log.logType === 'client' ? log.phone : log.clients?.phone;

                                            return (
                                                <tr key={`${log.logType}-${log.id}`} className="hover:bg-slate-800/30 transition-colors group">
                                                    <td className="px-4 py-4">
                                                        <div className="font-medium text-slate-200">{clientName || 'Cliente Avulso'}</div>
                                                        <div className="text-xs text-slate-500 mt-0.5">{clientPhone || 'Sem Telefone cadastrado'}</div>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {log.birthday_failed && (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">Aniversário</span>
                                                            )}
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
                                                        <div className="text-xs text-slate-500 mt-0.5">
                                                            {log.logType !== 'client' ? `${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • com ${log.professionals?.name?.split(' ')[0] || 'Barbeiro'}` : 'Data de Nascimento'}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-rose-400 text-xs line-clamp-3 leading-relaxed" title={log.birthday_failed ? log.birthday_error_log : log.rebook_failed ? log.rebook_error_log : log.feedback_failed ? log.feedback_error_log : log.noshow_failed ? log.noshow_error_log : log.reminder_error_log}>
                                                            {log.birthday_failed ? log.birthday_error_log : log.rebook_failed ? log.rebook_error_log : log.feedback_failed ? log.feedback_error_log : log.noshow_failed ? log.noshow_error_log : log.reminder_error_log || 'Falha desconhecida no webhook de envio.'}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="flex justify-end gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                                                            {phone ? (
                                                                <a href={generateWhatsAppLink(log)} target="_blank" rel="noopener noreferrer" className="p-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors border border-green-500/20" title="Enviar mensagem pré-preenchida">
                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                                </a>
                                                            ) : null}
                                                            <button onClick={() => handleResolveError(log.id, log.logType)} className="p-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-700" title="Marcar como Resolvido">
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

            {/* --- MODAL ANIVERSARIANTES --- */}
            {birthdayModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setBirthdayModal({ open: false, title: '', items: [] })} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">{birthdayModal.title}</h3>
                            <button onClick={() => setBirthdayModal({ open: false, title: '', items: [] })} className="text-slate-500 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            {birthdayModal.items.length === 0 ? (
                                <p className="text-center text-slate-500 py-8">Nenhum aniversariante encontrado para este período.</p>
                            ) : (
                                <div className="space-y-3">
                                    {birthdayModal.items.map((client, i) => {
                                        const phone = (client.phone || '').replace(/\D/g, '');
                                        const msg = messages.birthday.replace(/\{\{cliente\}\}/g, client.nome?.split(' ')[0] || 'Cliente');
                                        const waLink = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}` : '#';

                                        return (
                                            <div key={i} className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors">
                                                <div>
                                                    <p className="font-bold text-slate-200">{client.nome}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">🗓️ {client.data} • {client.phone || 'Sem telefone'}</p>
                                                </div>
                                                {phone && (
                                                    <a 
                                                        href={waLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-colors"
                                                        title="Enviar Parabéns no WhatsApp"
                                                    >
                                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                    </a>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
