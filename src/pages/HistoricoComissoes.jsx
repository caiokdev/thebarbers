import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const _fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function formatBRL(v) { return _fmtBRL.format(Number(v) || 0); }

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function HistoricoComissoes() {
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [payments, setPayments] = useState([]);
    
    // Filter states
    const nowInit = new Date();
    const [selectedMonth, setSelectedMonth] = useState(`${nowInit.getFullYear()}-${String(nowInit.getMonth() + 1).padStart(2, '0')}`);
    const [selectedPro, setSelectedPro] = useState('all');
    const [prosList, setProsList] = useState([]);

    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase.from('barbershops').select('id').limit(1).single();
            if (shop) setBarbershopId(shop.id);
            else setLoading(false);
        }
        fetchShop();
    }, []);

    useEffect(() => {
        if (!barbershopId) return;
        async function fetchBase() {
            const { data: pros } = await supabase.from('professionals').select('id, name').eq('barbershop_id', barbershopId);
            setProsList(pros || []);
        }
        fetchBase();
    }, [barbershopId]);

    const fetchHistory = React.useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
            const startOfMonthISO = new Date(selYear, selMonthNum - 1, 1, 0, 0, 0, 0).toISOString();
            const endOfMonthISO = new Date(selYear, selMonthNum, 0, 23, 59, 59, 999).toISOString();

            let query = supabase
                .from('commission_payments')
                .select(`
                    id, amount, commission_rate, gross_production, period_label, paid_at,
                    professional_id, professionals ( name )
                `)
                .eq('barbershop_id', barbershopId)
                .gte('paid_at', startOfMonthISO)
                .lte('paid_at', endOfMonthISO)
                .order('paid_at', { ascending: false });

            if (selectedPro !== 'all') {
                query = query.eq('professional_id', selectedPro);
            }

            const { data, error } = await query;
            if (error) {
                // Ignore relation error temporarily in case table doesn't exist
                if (error.code !== '42P01') console.error(error);
            } else {
                setPayments(data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [barbershopId, selectedMonth, selectedPro]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    async function handleDeletePayment(id) {
        if (!confirm('Deseja excluir este registro de pagamento? O saldo do caixa / despesas deverá ser ajustado manualmente se necessário.')) return;
        const { error } = await supabase.from('commission_payments').delete().eq('id', id);
        if (error) {
            toast.error('Erro ao excluir registro.');
        } else {
            toast.success('Registro excluído!');
            fetchHistory();
        }
    }

    const exportToExcel = () => {
        if (payments.length === 0) return toast.error('Sem dados para exportar.');
        const data = payments.map(p => ({
            'Profissional': p.professionals?.name || 'Desconhecido',
            'Data do Pagamento': formatDate(p.paid_at),
            'Período Referência': p.period_label || '-',
            'Produção Bruta': formatBRL(p.gross_production),
            'Taxa (%)': p.commission_rate + '%',
            'Valor Pago (Comissão)': formatBRL(p.amount)
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Comissoes");
        XLSX.writeFile(wb, `HistoricoComissoes_${selectedMonth}.xlsx`);
    };

    const exportToPDF = () => {
        if (payments.length === 0) return toast.error('Sem dados para exportar.');
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Histórico de Comissões Pagas - ${selectedMonth}`, 14, 20);
        
        const rows = payments.map(p => [
            p.professionals?.name || 'Desconhecido',
            formatDate(p.paid_at),
            p.period_label,
            formatBRL(p.gross_production),
            p.commission_rate + '%',
            formatBRL(p.amount)
        ]);

        autoTable(doc, {
            head: [["Profissional", "Data Pago", "Período", "Prod. Bruta", "Taxa", "Valor Pago"]],
            body: rows,
            startY: 30,
            theme: 'striped',
        });
        doc.save(`HistoricoComissoes_${selectedMonth}.pdf`);
    };

    const totalPago = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Header title="Histórico de Comissões" userName="Administrador" hideSearch hideNotifications />

                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                    {/* Header + Filters */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-800 p-5 rounded-2xl border border-slate-700">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Mês do Pagamento</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-red-600 outline-none"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Profissional</label>
                                <select
                                    value={selectedPro}
                                    onChange={e => setSelectedPro(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-red-600 outline-none min-w-[150px]"
                                >
                                    <option value="all">Todos</option>
                                    {prosList.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-right mr-4">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase">Total Pago no Mês</p>
                                <p className="text-xl font-bold text-red-500">{formatBRL(totalPago)}</p>
                            </div>
                            <button onClick={exportToExcel} className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors border border-slate-600" title="Exportar Excel">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            </button>
                            <button onClick={exportToPDF} className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors border border-slate-600" title="Exportar PDF">
                                <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                        {loading ? (
                            <div className="p-10 text-center text-slate-500">
                                <div className="inline-block w-8 h-8 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-2" />
                                <p>Carregando histórico...</p>
                            </div>
                        ) : payments.length === 0 ? (
                            <div className="p-10 text-center flex flex-col items-center justify-center">
                                <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-slate-400">Nenhum pagamento de comissão registrado.</p>
                                <p className="text-xs text-slate-500 mt-1">Marque como pago lá na aba Financeiro.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="text-[11px] uppercase bg-slate-900/50 text-slate-400 font-semibold border-b border-slate-700/50">
                                        <tr>
                                            <th className="px-5 py-3.5">Profissional</th>
                                            <th className="px-5 py-3.5">Data Pagamento</th>
                                            <th className="px-5 py-3.5">Ref (Período)</th>
                                            <th className="px-5 py-3.5 text-right">Prod. Bruta</th>
                                            <th className="px-5 py-3.5 text-center">Taxa</th>
                                            <th className="px-5 py-3.5 text-right font-bold text-slate-300">Valor Pago</th>
                                            <th className="px-5 py-3.5 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/30">
                                        {payments.map(p => (
                                            <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                                                <td className="px-5 py-3 font-medium text-slate-200">
                                                    {p.professionals?.name || 'Desconhecido'}
                                                </td>
                                                <td className="px-5 py-3 text-slate-400">
                                                    {formatDate(p.paid_at)}
                                                </td>
                                                <td className="px-5 py-3 text-slate-400 text-xs text-center border bg-slate-900/40 rounded mx-5 my-1 inline-block">
                                                    {p.period_label || 'Avulso'}
                                                </td>
                                                <td className="px-5 py-3 text-right text-slate-300">
                                                    {formatBRL(p.gross_production)}
                                                </td>
                                                <td className="px-5 py-3 text-center text-slate-500">
                                                    {p.commission_rate}%
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-green-400">
                                                    {formatBRL(p.amount)}
                                                </td>
                                                <td className="px-5 py-3 text-center">
                                                    <button onClick={() => handleDeletePayment(p.id)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Excluir">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
