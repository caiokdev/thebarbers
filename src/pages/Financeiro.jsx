import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { useFinanceiroData } from '../hooks/useFinanceiroData';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatTime, formatDateTime, getLocalDateISO } from '../utils/dateUtils';
import { formatCurrency, getStatusLabel } from '../utils/orderUtils';
import { useGlobalData } from '../context/GlobalDataContext';

/* ═══════════════════════════════════════════════════════════════
   Financeiro — Visão de Águia
   KPIs de Médio Prazo • Caixa do Dia • Comissões • Histórico
   ═══════════════════════════════════════════════════════════════ */

const getMasterPassword = () => {
    console.warn("getMasterPassword was removed. Use verify_master_password RPC instead.");
    return null;
};



function _formatDate(iso) {
    if (!iso) return '—';
    return formatDate(iso).substring(0, 5); // DD/MM
}

function _formatTime(iso) {
    return formatTime(iso);
}

export default function Financeiro() {
    console.log('Financeiro hook loaded');
    const {
        today, loading,
        selectedMonth, setSelectedMonth,
        isCurrentMonth, selectedMonthLabel, selYear,
        entradasHoje, saidasHoje, saldoDia,
        entradas7Dias, saidas7Dias, saldo7Dias,
        entradasMes, saidasMes, saldoMes,
        totalAssinantes, assinantesAtivos, assinantesAtrasados,
        listaSaidas, historicoComandas,
        showAllHistorico, setShowAllHistorico,
        currentPage, setCurrentPage, itemsPerPage,
        pedidosHoje, pedidos7Dias, pedidosMes, listaAssinantes,
        periodoComissao, setPeriodoComissao,
        comissoesPorBarbeiro,
        addExpense, verifyPassword, updateCommissionRate, payCommission
    } = useFinanceiroData();

    // ── Local UI States ──
    const [isCommissionUnlocked, setIsCommissionUnlocked] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordError, setIsPasswordError] = useState(false);
    const [checkingPassword, setCheckingPassword] = useState(false);
    const [expandedProfessionalId, setExpandedProfessionalId] = useState(null);

    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseDesc, setExpenseDesc] = useState('');
    const [savingExpense, setSavingExpense] = useState(false);

    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [detailsModalConfig, setDetailsModalConfig] = useState({ title: '', data: [], type: '' });
    const [expandedModalOrderId, setExpandedModalOrderId] = useState(null);
    const [expandedHistoricoOrderId, setExpandedHistoricoOrderId] = useState(null);

    // Confirmation Modal for Commission
    const [confirmModal, setConfirmModal] = useState({ open: false, targetData: null });

    // ── Save expense ──
    async function handleSaveExpense() {
        if (!expenseDesc.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
            toast.error('Preencha a descrição e um valor válido.');
            return;
        }
        setSavingExpense(true);
        try {
            await addExpense(expenseDesc.trim(), parseFloat(expenseAmount));
            setIsExpenseModalOpen(false);
            setExpenseDesc('');
            setExpenseAmount('');
            toast.success('Saída registrada com sucesso.');
        } catch (err) {
            toast.error(`Erro ao registrar saída: ${err.message}`);
        } finally {
            setSavingExpense(false);
        }
    }

    async function handleUnlock() {
        if (!passwordInput) {
            setIsPasswordError(true);
            return;
        }
        setCheckingPassword(true);
        try {
            const isValid = await verifyPassword(passwordInput);
            if (isValid) {
                setIsCommissionUnlocked(true);
                setIsPasswordModalOpen(false);
                setPasswordInput('');
                setIsPasswordError(false);
            } else {
                setIsPasswordError(true);
            }
        } catch (err) {
            console.error('Erro ao verificar senha:', err);
            setIsPasswordError(true);
        } finally {
            setCheckingPassword(false);
        }
    }

    async function handleEditRate(proId, proName) {
        const input = prompt(`Nova porcentagem de comissão para ${proName} (ex: 45):`);
        if (input === null) return;
        const newRate = parseFloat(input);
        if (isNaN(newRate) || newRate < 0 || newRate > 100) { toast.error('Valor inválido. Use um número entre 0 e 100.'); return; }
        try {
            await updateCommissionRate(proId, newRate);
            toast.success('Taxa atualizada.');
        } catch (error) {
            toast.error(`Erro: ${error.message}`);
        }
    }

    function triggerPayCommission(b) {
        setConfirmModal({
            open: true,
            targetData: b
        });
    }

    async function handleConfirmPayCommission() {
        const b = confirmModal.targetData;
        if (!b) return;
        try {
            await payCommission(b);
            toast.success('Pagamento registrado no histórico!');
            setConfirmModal({ open: false, targetData: null });
        } catch (err) {
            toast.error(`Erro ao registrar: ${err.message}`);
        }
    }

    // ── Date label ──
    const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const dateLabel = `${DAY_NAMES[today.getDay()]}, ${today.getDate()} de ${MONTH_NAMES[today.getMonth()]}`;

    // ── Payment method labels ──
    const payLabels = { pix: 'PIX', cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', credit_card: 'Crédito', debit_card: 'Débito', transfer: 'Transferência' };

    // ── Drill-down helper ──
    function openDetails(title, data, type) {
        setDetailsModalConfig({ title, data, type });
        setDetailsModalOpen(true);
    }

    // ── Pagination helpers ──
    const totalPages = Math.max(1, Math.ceil(historicoComandas.length / itemsPerPage));
    const paginatedHistorico = historicoComandas.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const showingFrom = historicoComandas.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const showingTo = Math.min(currentPage * itemsPerPage, historicoComandas.length);

    // ── Excel Export ──
    const exportToExcel = () => {
        if (!historicoComandas || historicoComandas.length === 0) {
            toast.error('Não há dados para exportar neste mês.');
            return;
        }

        const dataToExport = historicoComandas.map(item => {
            const itemsList = (item.order_items || []).map(it => `${it.quantity}x ${it.name} (${formatCurrency(it.price)})`).join(' | ');

            return {
                'Cliente': item.cliente,
                'Profissional': item.profissional,
                'Data Fechamento': `${_formatDate(item.fechamento)} ${_formatTime(item.fechamento)}`,
                'Método Pagamento': payLabels[item.pagamento] || item.pagamento,
                'Itens da Comanda': itemsList || 'Sem itens detalhados',
                'Valor Final (R$)': item.valor.toFixed(2).replace('.', ',')
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        XLSX.writeFile(wb, `Financeiro_${selectedMonth}.xlsx`);
    };

    // ── PDF Export ──
    const exportToPDF = () => {
        if (!historicoComandas || historicoComandas.length === 0) {
            toast.error('Não há dados para exportar neste mês.');
            return;
        }

        const doc = new jsPDF('landscape'); // Landscape to fit the items column

        doc.setFontSize(18);
        doc.text(`Relatório Financeiro - ${selectedMonthLabel} ${selYear}`, 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);

        const tableColumn = ["Cliente", "Profissional", "Fechamento", "Pagamento", "Itens", "Valor"];
        const tableRows = [];

        historicoComandas.forEach(item => {
            const itemsList = (item.order_items || []).map(it => `${it.quantity}x ${it.name}`).join(', ');

            const rowData = [
                item.cliente,
                item.profissional,
                `${_formatDate(item.fechamento)} ${_formatTime(item.fechamento)}`,
                payLabels[item.pagamento] || item.pagamento,
                itemsList || '-',
                formatCurrency(item.valor)
            ];
            tableRows.push(rowData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            columnStyles: {
                4: { cellWidth: 80 } // Give more width to the items column
            }
        });

        doc.save(`Financeiro_${selectedMonth}.pdf`);
    };

    const exportProfessionalExcel = (b) => {
        if (!b.orders || b.orders.length === 0) return toast.error('Não há comandas para exportar.');
        const dataToExport = b.orders.map(item => {
            const itemsList = (item.order_items || []).map(it => `${it.quantity}x ${it.name} (${formatCurrency(it.price)})`).join(' | ');
            return {
                'Cliente/Pedido': item.cliente || item.id.split('-')[0],
                'Data Fechamento': `${_formatDate(item.closed_at)} ${_formatTime(item.closed_at)}`,
                'Método Pagamento': payLabels[item.payment_method] || item.payment_method || '—',
                'Itens da Comanda': itemsList || 'Sem itens',
                'Valor Produzido': parseFloat(item.total_amount || 0).toFixed(2).replace('.', ','),
                'Valor Comissão': (parseFloat(item.total_amount || 0) * (b.rate / 100)).toFixed(2).replace('.', ',')
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Comissao");
        XLSX.writeFile(wb, `Comissao_${b.nome.replace(/\s+/g, '_')}_${periodoComissao}.xlsx`);
    };

    const exportProfessionalPDF = (b) => {
        if (!b.orders || b.orders.length === 0) return toast.error('Não há comandas para exportar.');
        const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text(`Relatório de Comissões - ${b.nome}`, 14, 20);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Período analisado: ${periodoComissao === 'mes' ? selectedMonthLabel : (periodoComissao === 'semana' ? 'Últimos 7 dias' : 'Hoje')} | Comissão: ${b.rate}%`, 14, 28);

        const tableColumn = ["Data", "Cliente/Pedido", "Pagamento", "Itens Realizados", "Produção", "Comissão"];
        const tableRows = b.orders.map(item => {
            const itemsList = (item.order_items || []).map(it => `${it.quantity}x ${it.name}`).join(', ');
            const prodVal = parseFloat(item.total_amount || 0);
            const comVal = prodVal * (b.rate / 100);
            return [
                `${_formatDate(item.closed_at)} ${_formatTime(item.closed_at)}`,
                item.cliente || item.id.split('-')[0],
                payLabels[item.payment_method] || item.payment_method || '—',
                itemsList || '-',
                formatCurrency(prodVal),
                formatCurrency(comVal)
            ];
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
        });

        const finalY = doc.lastAutoTable.finalY || 35;
        doc.setFontSize(12);
        doc.setTextColor(50);
        doc.text(`Produção Bruta: ${formatCurrency(b.totalGerado)}  |  Comissão a Pagar: ${formatCurrency(b.valorComissao)}`, 14, finalY + 10);

        doc.save(`Comissao_${b.nome.replace(/\s+/g, '_')}_${periodoComissao}.pdf`);
    };

    return (
        <>
            {/* ── Header ── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-slate-100">Financeiro</h1>
                            <p className="text-xs text-slate-500 mt-0.5">Visão de Águia • {dateLabel}</p>
                        </div>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-red-600 transition-colors cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/25 text-sm font-semibold hover:bg-rose-500/20 hover:border-rose-500/40 transition-all duration-200"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                        Registrar Saída
                    </button>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {loading ? (
                        <div className="flex items-center justify-center py-32">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-3" />
                                <p className="text-sm text-slate-500">Carregando financeiro...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ══════════════════════════════════════════
                                LINHA 1 — 4 KPI Cards de Resumo
                            ══════════════════════════════════════════ */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Card 1: Saldo Hoje */}
                                <div onClick={() => isCurrentMonth && openDetails('Faturamento Hoje', pedidosHoje, 'orders')} className={`bg-slate-800 rounded-2xl border border-slate-700 p-5 transition-all ${isCurrentMonth ? 'hover:border-slate-600 hover:ring-2 ring-slate-600 cursor-pointer' : 'opacity-50'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(181,148,16,0.15)' }}>
                                            <svg className="w-5 h-5" style={{ color: '#B59410' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Saldo Hoje</p>
                                            <p className="text-[10px] text-slate-600">{isCurrentMonth ? 'Entradas - Saídas' : 'Mês passado'}</p>
                                        </div>
                                    </div>
                                    {isCurrentMonth ? (
                                        <>
                                            <p className={`text-2xl font-bold ${saldoDia >= 0 ? '' : 'text-rose-400'}`} style={saldoDia >= 0 ? { color: '#B59410' } : {}}>
                                                {saldoDia < 0 ? '- ' : ''}{formatCurrency(Math.abs(saldoDia))}
                                            </p>
                                            <div className="flex gap-4 mt-2">
                                                <span className="text-[11px] text-green-400/80">↑ {formatCurrency(entradasHoje)}</span>
                                                <span className="text-[11px] text-rose-400/70">↓ {formatCurrency(saidasHoje)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-2xl font-bold text-slate-600">N/A</p>
                                    )}
                                </div>

                                {/* Card 2: Saldo 7 Dias */}
                                <div onClick={() => isCurrentMonth && openDetails('Faturamento — 7 Dias', pedidos7Dias, 'orders')} className={`bg-slate-800 rounded-2xl border border-slate-700 p-5 transition-all ${isCurrentMonth ? 'hover:border-slate-600 hover:ring-2 ring-slate-600 cursor-pointer' : 'opacity-50'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Últimos 7 dias</p>
                                            <p className="text-[10px] text-slate-600">{isCurrentMonth ? 'Saldo líquido' : 'Mês passado'}</p>
                                        </div>
                                    </div>
                                    {isCurrentMonth ? (
                                        <>
                                            <p className={`text-2xl font-bold ${saldo7Dias >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                                                {saldo7Dias < 0 ? '- ' : ''}{formatCurrency(Math.abs(saldo7Dias))}
                                            </p>
                                            <div className="flex gap-4 mt-2">
                                                <span className="text-[11px] text-green-400/80">↑ {formatCurrency(entradas7Dias)}</span>
                                                <span className="text-[11px] text-rose-400/70">↓ {formatCurrency(saidas7Dias)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-2xl font-bold text-slate-600">N/A</p>
                                    )}
                                </div>

                                {/* Card 3: Saldo Mês */}
                                <div onClick={() => openDetails(`Faturamento — ${MONTH_NAMES[today.getMonth()]}`, pedidosMes, 'orders')} className="bg-slate-800 rounded-2xl border border-slate-700 p-5 hover:border-slate-600 hover:ring-2 ring-slate-600 transition-all cursor-pointer">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{selectedMonthLabel}</p>
                                            <p className="text-[10px] text-slate-600">Saldo líquido</p>
                                        </div>
                                    </div>
                                    <p className={`text-2xl font-bold ${saldoMes >= 0 ? 'text-violet-400' : 'text-rose-400'}`}>
                                        {saldoMes < 0 ? '- ' : ''}{formatCurrency(Math.abs(saldoMes))}
                                    </p>
                                    <div className="flex gap-4 mt-2">
                                        <span className="text-[11px] text-green-400/80">↑ {formatCurrency(entradasMes)}</span>
                                        <span className="text-[11px] text-rose-400/70">↓ {formatCurrency(saidasMes)}</span>
                                    </div>
                                </div>

                                {/* Card 4: Assinantes */}
                                <div onClick={() => openDetails('Assinantes', listaAssinantes, 'subscribers')} className="bg-slate-800 rounded-2xl border border-slate-700 p-5 hover:border-yellow-700 hover:ring-2 ring-yellow-700/40 transition-all cursor-pointer">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(181,148,16,0.15)' }}>
                                            <svg className="w-5 h-5" style={{ color: '#B59410' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assinantes</p>
                                            <p className="text-[10px] text-slate-600">Planos ativos</p>
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold" style={{ color: '#B59410' }}>{totalAssinantes}</p>
                                    <div className="flex gap-4 mt-2">
                                        <span className="text-[11px]" style={{ color: 'rgba(181,148,16,0.8)' }}>✓ {assinantesAtivos} Em dia</span>
                                        {assinantesAtrasados > 0 && (
                                            <span className="text-[11px] text-rose-400/70">⚠ {assinantesAtrasados} Atrasados</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════
                                LINHA 2 — Saídas do Dia + Comissões
                            ══════════════════════════════════════════ */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* ── Saídas do Dia ── */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                        </svg>
                                        Saídas — {selectedMonthLabel}
                                        <span className="text-xs font-normal text-slate-600 ml-auto">{listaSaidas.length} registro{listaSaidas.length !== 1 ? 's' : ''}</span>
                                    </h2>

                                    {listaSaidas.length > 0 ? (
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                            {listaSaidas.map((s) => (
                                                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-700/30 hover:border-slate-600 transition-colors">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                                                            </svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-slate-200 truncate">{s.description}</p>
                                                            <p className="text-[11px] text-slate-600">{_formatTime(s.created_at)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-semibold text-rose-400 ml-3 flex-shrink-0">- {formatCurrency(s.amount)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10">
                                            <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-sm text-slate-500">Nenhuma saída registrada hoje.</p>
                                            <p className="text-xs text-slate-600 mt-1">Caixa 100% positivo ✓</p>
                                        </div>
                                    )}
                                </div>

                                {/* ── Comissões (Cofre) ── */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                            </svg>
                                            Comissões
                                        </div>
                                        <button onClick={() => window.open('/historico-comissoes', '_blank')} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-600/50 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Ver Histórico
                                        </button>
                                    </h2>

                                    {!isCommissionUnlocked ? (
                                        <div className="text-center py-8">
                                            <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-700 flex items-center justify-center mx-auto mb-4">
                                                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-base font-semibold text-slate-200 mb-1">Área Restrita</h3>
                                            <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto">Protegido por senha master</p>
                                            <button
                                                onClick={() => { setPasswordInput(''); setIsPasswordError(false); setIsPasswordModalOpen(true); }}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/25 hover:border-amber-500/50 transition-all duration-200"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                                Desbloquear
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            {/* Period filter */}
                                            <div className="flex gap-1.5 mb-4">
                                                {[{ k: 'hoje', l: 'Hoje' }, { k: 'semana', l: 'Esta Semana' }, { k: 'mes', l: 'Este Mês' }]
                                                    .filter(p => isCurrentMonth ? true : p.k === 'mes') // Hide hoje/semana for past months
                                                    .map(p => (
                                                        <button key={p.k} onClick={() => setPeriodoComissao(p.k)}
                                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${periodoComissao === p.k
                                                                ? 'bg-red-600/20 text-red-500 border border-red-600/30'
                                                                : 'bg-slate-900/50 text-slate-500 border border-slate-700/30 hover:text-slate-300'
                                                                }`}
                                                        >{isCurrentMonth ? p.l : 'Mês Selecionado'}</button>
                                                    ))}
                                            </div>

                                            {/* Barber list */}
                                            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                                {comissoesPorBarbeiro.length > 0 ? comissoesPorBarbeiro.map(b => {
                                                    const isExpanded = expandedProfessionalId === b.id;
                                                    return (
                                                        <div key={b.id} className="bg-slate-900/40 border border-slate-700/30 rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
                                                            {/* Clickable Header */}
                                                            <div
                                                                className="p-4 cursor-pointer"
                                                                onClick={() => setExpandedProfessionalId(isExpanded ? null : b.id)}
                                                            >
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <svg className={`w-4 h-4 text-red-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                                        </svg>
                                                                        <p className="text-sm font-semibold text-slate-200">{b.nome}</p>
                                                                    </div>
                                                                    <button onClick={(e) => { e.stopPropagation(); triggerPayCommission(b); }} className="text-[10px] px-2.5 py-1 rounded-lg bg-red-600/10 text-red-500/70 border border-red-600/20 hover:bg-red-600/20 hover:text-red-500 transition-all">
                                                                        ✓ Marcar como Pago
                                                                    </button>
                                                                </div>
                                                                <div className="flex items-center justify-between pl-6">
                                                                    <span className="text-[11px] text-slate-500">Produção Bruta: {formatCurrency(b.totalGerado)}</span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-sm font-bold" style={{ color: '#B59410' }}>Comissão ({b.rate}%): {formatCurrency(b.valorComissao)}</span>
                                                                        <button onClick={(e) => { e.stopPropagation(); handleEditRate(b.id, b.nome); }} className="text-slate-500 hover:text-amber-400 transition-colors" title="Editar taxa">
                                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Detailed Sub-Table */}
                                                            {isExpanded && (
                                                                <div className="bg-slate-800/80 border-t border-slate-700/50 p-4">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                                                                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
                                                                            Comandas ({(b.orders || []).length})
                                                                        </p>
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => exportProfessionalExcel(b)} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-red-600/50 text-slate-300 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 transition-all shadow-sm">
                                                                                <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                                                                Excel
                                                                            </button>
                                                                            <button onClick={() => exportProfessionalPDF(b)} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-rose-500/50 text-slate-300 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 transition-all shadow-sm">
                                                                                <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                                                                PDF
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {b.orders && b.orders.length > 0 ? (
                                                                        <div className="overflow-x-auto rounded-lg border border-slate-700/60 overflow-hidden">
                                                                            <table className="w-full text-left text-xs text-slate-300">
                                                                                <thead className="text-[10px] uppercase bg-slate-700/40 text-slate-400">
                                                                                    <tr>
                                                                                        <th className="px-3 py-2.5 font-semibold">Data/Hora</th>
                                                                                        <th className="px-3 py-2.5 font-semibold">Cliente</th>
                                                                                        <th className="px-3 py-2.5 font-semibold min-w-[120px]">Serviços/Produtos</th>
                                                                                        <th className="px-3 py-2.5 font-semibold text-center">Pagamento</th>
                                                                                        <th className="px-3 py-2.5 font-semibold text-right" style={{ background: 'rgba(181,148,16,0.1)', color: '#B59410' }}>Comissão ({b.rate}%)</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-700/50 bg-slate-900/60">
                                                                                    {b.orders.map(order => {
                                                                                        const prodVal = parseFloat(order.total_amount || 0);
                                                                                        const comVal = prodVal * (b.rate / 100);
                                                                                        const itemsDesc = (order.order_items || []).map(it => `${it.quantity}x ${it.name}`).join(', ');
                                                                                        return (
                                                                                            <tr key={order.id} className="hover:bg-slate-800/80 transition-colors">
                                                                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="font-medium text-slate-200">{_formatDate(order.closed_at)}</span>
                                                                                                        <span className="text-[10px] text-slate-500">{_formatTime(order.closed_at)}</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-3 py-2.5 font-medium">{order.cliente || order.id.split('-')[0]}</td>
                                                                                                <td className="px-3 py-2.5 text-[11px] text-slate-400 leading-tight pr-4">{itemsDesc || '-'}</td>
                                                                                                <td className="px-3 py-2.5 text-center">
                                                                                                    <span className="px-1.5 py-0.5 bg-slate-800 rounded font-medium text-[10px] text-slate-300 border border-slate-700/50">
                                                                                                        {payLabels[order.payment_method] || order.payment_method || '-'}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td className="px-3 py-2.5 text-right font-bold" style={{ color: '#B59410' }}>
                                                                                                    {formatCurrency(comVal)}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center justify-center p-6 bg-slate-900/40 rounded-lg border border-slate-700/40 border-dashed">
                                                                            <svg className="w-8 h-8 text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                                                            <p className="text-xs text-slate-500">Nenhum dado detalhado encontrado.</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }) : (
                                                    <div className="text-center py-6">
                                                        <p className="text-xs text-slate-500">Nenhum atendimento no período.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => setIsCommissionUnlocked(false)}
                                                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-500 text-xs hover:text-slate-300 hover:border-slate-600 transition-all"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                                Bloquear Novamente
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════
                                LINHA 3 — Histórico de Transações
                            ══════════════════════════════════════════ */}
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-4">
                                    <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                        </svg>
                                        Histórico de Comandas Fechadas
                                        <span className="text-xs font-normal text-slate-600 ml-2">{showAllHistorico ? `${historicoComandas.length} registros` : `Últimas ${historicoComandas.length}`}</span>
                                    </h2>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <button
                                            onClick={() => setShowAllHistorico(!showAllHistorico)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${showAllHistorico ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50'}`}
                                        >
                                            {showAllHistorico ? 'Mostrar menos' : 'Mostrar todas'}
                                        </button>
                                        <button
                                            onClick={exportToExcel}
                                            className="px-3 py-1.5 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/20 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            Excel
                                        </button>
                                        <button
                                            onClick={exportToPDF}
                                            className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            PDF
                                        </button>
                                    </div>
                                </div>

                                {historicoComandas.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                                                    <th className="pb-3 pr-4">Cliente</th>
                                                    <th className="pb-3 pr-4">Profissional</th>
                                                    <th className="pb-3 pr-4">Abertura</th>
                                                    <th className="pb-3 pr-4">Fechamento</th>
                                                    <th className="pb-3 pr-4">Pagamento</th>
                                                    <th className="pb-3 text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/30">
                                                {paginatedHistorico.map((h) => {
                                                    const items = h.order_items || [];
                                                    const isExpH = expandedHistoricoOrderId === h.id;
                                                    return (
                                                        <React.Fragment key={h.id}>
                                                            <tr
                                                                className="hover:bg-slate-800 transition-colors cursor-pointer"
                                                                onClick={() => setExpandedHistoricoOrderId(isExpH ? null : h.id)}
                                                            >
                                                                <td className="py-3 pr-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 ${isExpH ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                                        </svg>
                                                                        <p className="text-slate-200 font-medium">{h.cliente}</p>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <p className="text-slate-400">{h.profissional}</p>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="text-slate-500">{_formatDate(h.abertura)}</span>
                                                                    <span className="text-slate-600 ml-1">{_formatTime(h.abertura)}</span>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="text-slate-500">{_formatDate(h.fechamento)}</span>
                                                                    <span className="text-slate-600 ml-1">{_formatTime(h.fechamento)}</span>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-700/50 text-xs text-slate-400">
                                                                        {payLabels[h.pagamento] || h.pagamento}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 text-right">
                                                                    <p className="font-bold" style={{ color: '#B59410' }}>{formatCurrency(h.valor)}</p>
                                                                </td>
                                                            </tr>
                                                            {isExpH && (
                                                                <tr>
                                                                    <td colSpan={6} className="p-0">
                                                                        <div className="bg-slate-900/50 border-l-2 border-red-600/30 px-5 py-3 mx-2 mb-2 rounded-lg">
                                                                            {items.length > 0 ? (
                                                                                <div className="space-y-1.5">
                                                                                    {items.filter(it => it.item_type === 'service').length > 0 && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Serviços</p>
                                                                                            {items.filter(it => it.item_type === 'service').map((it, j) => (
                                                                                                <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                                    <span>{it.quantity}x {it.name}</span>
                                                                                                    <span className="text-slate-400">{formatCurrency(parseFloat(it.price || 0))}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                    {items.filter(it => it.item_type === 'product').length > 0 && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1 mt-2">Produtos</p>
                                                                                            {items.filter(it => it.item_type === 'product').map((it, j) => (
                                                                                                <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                                    <span>{it.quantity}x {it.name}</span>
                                                                                                    <span className="text-slate-400">{formatCurrency(parseFloat(it.price || 0))}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <p className="text-xs text-slate-600 italic">Nenhum item detalhado registrado.</p>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {/* Pagination controls */}
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                                            <p className="text-xs text-slate-500">Mostrando {showingFrom} a {showingTo} de {historicoComandas.length} registros</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Anterior</button>
                                                <span className="px-3 py-1.5 rounded-lg bg-red-600/15 text-xs text-red-500 font-semibold">{currentPage} / {totalPages}</span>
                                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Próximo →</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-10">
                                        <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                        <p className="text-sm text-slate-500">Nenhuma comanda fechada ainda.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ══════════════════════════════════
                    Modal de Senha Master
                ══════════════════════════════════ */}
                {
                    isPasswordModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setIsPasswordModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-100">Senha Master</h3>
                                        <p className="text-xs text-slate-500">Digite a senha do proprietário</p>
                                    </div>
                                </div>
                                <input
                                    type="password"
                                    value={passwordInput}
                                    onChange={e => { setPasswordInput(e.target.value); setIsPasswordError(false); }}
                                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                    placeholder="••••••••"
                                    autoFocus
                                    className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors mb-4 ${isPasswordError ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-red-600'}`}
                                />
                                {isPasswordError && <p className="text-xs text-red-400 mb-3 -mt-2">Senha incorreta. Se nunca configurou, crie uma em seu Perfil (canto inferior esquerdo).</p>}
                                <div className="flex gap-3">
                                    <button onClick={() => setIsPasswordModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors">Cancelar</button>
                                    <button onClick={handleUnlock} className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 shadow-lg shadow-red-600/25 transition-all">Desbloquear</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ══════════════════════════════════
                    Modal de Nova Saída
                ══════════════════════════════════ */}
                {
                    isExpenseModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setIsExpenseModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-100">Registrar Saída</h3>
                                        <p className="text-xs text-slate-500">Despesa, sangria ou reforço</p>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Descrição *</label>
                                        <input
                                            type="text"
                                            value={expenseDesc}
                                            onChange={e => setExpenseDesc(e.target.value)}
                                            placeholder="Ex: Conta de Luz, Café..."
                                            autoFocus
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Valor (R$) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100000"
                                            value={expenseAmount}
                                            onChange={e => setExpenseAmount(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveExpense()}
                                            placeholder="0,00"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 transition-colors"
                                        />
                                    </div>
                                </div>

                                {expenseAmount && parseFloat(expenseAmount) > 0 && (
                                    <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3 mb-5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">Valor a registrar</span>
                                            <span className="text-base font-bold text-rose-400">- {formatCurrency(parseFloat(expenseAmount))}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button onClick={() => setIsExpenseModalOpen(false)} disabled={savingExpense} className="flex-1 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50">Cancelar</button>
                                    <button onClick={handleSaveExpense} disabled={savingExpense} className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                        {savingExpense && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {savingExpense ? 'Salvando...' : 'Confirmar Saída'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ══════════════════════════════════
                    Modal de Drill-down (Detalhes)
                ══════════════════════════════════ */}
                {
                    detailsModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setDetailsModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-base font-semibold text-slate-100">{detailsModalConfig.title}</h3>
                                    <button onClick={() => setDetailsModalOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
                                    {detailsModalConfig.data.length === 0 && (
                                        <p className="text-sm text-slate-500 text-center py-8">Nenhum registro encontrado.</p>
                                    )}

                                    {detailsModalConfig.type === 'orders' && detailsModalConfig.data.map((item, i) => {
                                        const items = item.order_items || [];
                                        const isExpM = expandedModalOrderId === (item.id || i);
                                        return (
                                            <div key={item.id || i}>
                                                <div
                                                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-700/30 cursor-pointer hover:bg-slate-800 transition-colors"
                                                    onClick={() => setExpandedModalOrderId(isExpM ? null : (item.id || i))}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <svg className={`w-3.5 h-3.5 text-slate-600 flex-shrink-0 transition-transform duration-200 ${isExpM ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                        </svg>
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-slate-200 font-medium truncate">{item.cliente}</p>
                                                            <p className="text-[11px] text-slate-600">{_formatDate(item.data)} {_formatTime(item.data)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-bold text-red-500 ml-3 flex-shrink-0">{formatCurrency(item.valor)}</p>
                                                </div>
                                                {isExpM && (
                                                    <div className="bg-slate-900/50 border-l-2 border-red-600/30 px-5 py-3 mx-2 mb-1 rounded-lg mt-1">
                                                        {items.length > 0 ? (
                                                            <div className="space-y-1.5">
                                                                {items.filter(it => it.item_type === 'service').length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Serviços</p>
                                                                        {items.filter(it => it.item_type === 'service').map((it, j) => (
                                                                            <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                <span>{it.quantity}x {it.name}</span>
                                                                                <span className="text-slate-400">{formatCurrency(parseFloat(it.price || 0))}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {items.filter(it => it.item_type === 'product').length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1 mt-2">Produtos</p>
                                                                        {items.filter(it => it.item_type === 'product').map((it, j) => (
                                                                            <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                <span>{it.quantity}x {it.name}</span>
                                                                                <span className="text-slate-400">{formatCurrency(parseFloat(it.price || 0))}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-slate-600 italic">Nenhum item detalhado registrado.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {detailsModalConfig.type === 'subscribers' && detailsModalConfig.data.map((item, i) => (
                                        <div key={item.id || i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-700/30">
                                            <p className="text-sm text-slate-200 font-medium truncate">{item.cliente}</p>
                                            <span
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${item.status !== 'active' ? 'bg-red-600 text-white' : ''}`}
                                                style={item.status === 'active' ? { background: '#111', color: '#fff', boxShadow: '0 0 0 1px rgba(181,148,16,0.5)' } : {}}
                                            >
                                                {item.status === 'active' ? '★ Em dia' : '⚠ Atrasado'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {detailsModalConfig.type === 'orders' && detailsModalConfig.data.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
                                        <span className="text-xs text-slate-500">{detailsModalConfig.data.length} registro{detailsModalConfig.data.length !== 1 ? 's' : ''}</span>
                                        <span className="text-sm font-bold" style={{ color: '#B59410' }}>
                                            Total: {formatCurrency(detailsModalConfig.data.reduce((s, o) => s + (o.valor || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }
                {
                    confirmModal.open && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                                <h3 className="text-lg font-bold text-slate-100 mb-2">Confirmar Pagamento</h3>
                                <p className="text-sm text-slate-400 mb-6">Confirma o pagamento de {formatCurrency(confirmModal.targetData?.valorComissao)} para {confirmModal.targetData?.nome}?</p>
                                <div className="flex gap-3">
                                    <button onClick={() => setConfirmModal({ open: false, targetData: null })} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors">Cancelar</button>
                                    <button onClick={handleConfirmPayCommission} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors">Confirmar</button>
                                </div>
                            </div>
                        </div>
                    )
                }
        </>
    );
}
