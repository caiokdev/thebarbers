import React, { useState } from 'react';

function formatCurrency(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

const STATUS_CONFIG = {
    scheduled: { label: 'Agendado', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    confirmed: { label: 'Confirmado', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    open: { label: 'Aberto', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    completed: { label: 'Concluído', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    canceled: { label: 'Cancelado', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
    no_show: { label: 'Não Compareceu', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};

export default function OrderDetailsModal({ order, clientMap, proMap, onClose, onDelete, onCancel, onNoShow, onOpenComanda }) {
    const [actionLoading, setActionLoading] = useState(false);

    // Safety check
    if (!order) return null;

    const dt = new Date(order.scheduled_at || order.created_at || new Date());
    const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;
    const statusLabel = order.status === 'open' ? 'Comanda Aberta' : statusCfg.label;

    // For Dashboard we might pass already computed names, so we handle both cases
    const clientName = order.client_name || clientMap?.[order.client_id] || 'Cliente';
    const proName = order.professional_name || proMap?.[order.professional_id] || 'Profissional';

    const handleCancel = async () => {
        if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
        setActionLoading(true);
        if (onCancel) await onCancel(order);
        setActionLoading(false);
    };

    const handleNoShow = async () => {
        if (!confirm('Marcar este cliente como "Não Compareceu"?')) return;
        setActionLoading(true);
        if (onNoShow) await onNoShow(order);
        setActionLoading(false);
    };

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja EXCLUIR este agendamento? Esta ação não pode ser desfeita.')) return;
        setActionLoading(true);
        if (onDelete) await onDelete(order);
        setActionLoading(false);
    };

    const handleOpenComanda = async () => {
        setActionLoading(true);
        if (onOpenComanda) await onOpenComanda(order);
        setActionLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">{clientName}</h3>
                            <p className="text-xs text-slate-500">Detalhes do agendamento</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors self-end">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
                <div className="mb-6 flex justify-end">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>
                        {statusLabel}
                    </span>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Data</p>
                        <p className="text-sm font-semibold text-slate-100">{dateStr}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Horário</p>
                        <p className="text-sm font-semibold text-slate-100">{timeStr}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50 flex-col justify-center truncate">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Barbeiro</p>
                        <p className="text-sm font-semibold text-slate-100 truncate" title={proName}>{proName}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Valor</p>
                        <p className="text-sm font-bold text-emerald-400">{formatCurrency(order.total_amount)}</p>
                    </div>
                </div>

                {/* Order ID */}
                <div className="bg-slate-900/40 rounded-lg px-4 py-2 mb-6 border border-slate-700/30">
                    <p className="text-[11px] text-slate-500">ID do pedido: <span className="text-slate-400 font-mono">{order.id?.slice(0, 8)}...</span></p>
                </div>

                {/* Actions */}
                {['canceled', 'closed', 'no_show', 'completed'].includes(order.status) ? (
                    <div className="pt-4 border-t border-slate-700">
                        <p className="text-center text-sm text-slate-500 italic">
                            {order.status === 'no_show' ? '⚠️ Cliente não compareceu a este agendamento.' : 'Nenhuma ação disponível para este status.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 pt-4 border-t border-slate-700">
                        {/* Main actions row */}
                        <div className="flex items-center gap-3">
                            {onCancel && (
                                <button
                                    onClick={handleCancel}
                                    disabled={actionLoading || order.status === 'open'}
                                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border ${order.status === 'open'
                                        ? 'text-slate-500 bg-slate-800 border-slate-700 cursor-not-allowed opacity-50'
                                        : 'text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50'
                                        }`}
                                >
                                    {actionLoading ? <div className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" /> : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    )}
                                    Cancelar
                                </button>
                            )}
                            {onOpenComanda && (
                                <button
                                    onClick={order.status !== 'open' ? handleOpenComanda : undefined}
                                    disabled={actionLoading || order.status === 'open'}
                                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${order.status === 'open'
                                        ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20 cursor-not-allowed opacity-70'
                                        : 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 disabled:opacity-50'
                                        }`}
                                >
                                    {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                        order.status === 'open' ? (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                        )
                                    )}
                                    {order.status === 'open' ? 'Comanda Aberta' : 'Abrir Comanda'}
                                </button>
                            )}
                        </div>
                        {/* No-show button */}
                        {order.status !== 'open' && onNoShow && (
                            <button
                                onClick={handleNoShow}
                                disabled={actionLoading}
                                className="w-full px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border text-slate-400 bg-slate-800 border-slate-600 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" /> : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                )}
                                Marcar como Falta / Não Compareceu
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={handleDelete}
                                disabled={actionLoading}
                                className="w-full px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-50"
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                )}
                                Excluir Agendamento
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
