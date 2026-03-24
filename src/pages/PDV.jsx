import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { isValidUUID } from '../utils/orderUtils';
import { useGlobalData } from '../context/GlobalDataContext';

/* ═══════════════════════════════════════════════════════════════
   PDV — Fechamento de Comanda
   ═══════════════════════════════════════════════════════════════ */
export default function PDV() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { adminProfile, loading: globalLoading, refreshData } = useGlobalData();
    const barbershopId = adminProfile?.barbershopId;

    // ── Core state ──
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── Cart state ──
    const [comandaItems, setComandaItems] = useState([]);

    // ── Payment state ──
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
    const [finalizing, setFinalizing] = useState(false);

    // ── Catalog (for upsell) ──
    const [catalog, setCatalog] = useState([]);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [showCatalog, setShowCatalog] = useState(false);

    // ── Fetch order ──
    useEffect(() => {
        if (!id || !isValidUUID(id)) {
            if (id) toast.error('Comanda inválida.');
            navigate('/dashboard');
            return;
        }

        async function fetchOrder() {
            setLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .eq('id', id)
                .single();

            if (error) {
                console.error('Error fetching order:', error);
                toast.error('Erro ao buscar comanda.');
                navigate('/dashboard');
                return;
            }

            if (data) {
                setOrder(data);
                // Populate cart from existing order_items
                const existing = (data.order_items || []).map((item, i) => ({
                    _localId: `existing-${item.id || i}`,
                    id: item.id,
                    name: item.name,
                    price: parseFloat(item.price || 0),
                    quantity: item.quantity || 1,
                    item_type: item.item_type || 'service',
                }));
                setComandaItems(existing);
            }
            setLoading(false);
        }
        fetchOrder();
    }, [id, navigate]);

    // ── Fetch catalog (services + products) ──
    useEffect(() => {
        async function fetchCatalog() {
            if (!order?.barbershop_id) return;
            const bId = order.barbershop_id;

            const [productsRes] = await Promise.all([
                supabase.from('products').select('id, name, price, current_stock')
                    .eq('barbershop_id', bId).order('name'),
            ]);

            const productItems = (productsRes.data || []).map(p => ({
                catalogId: p.id,
                name: p.name,
                price: parseFloat(p.price || 0),
                item_type: 'product',
                current_stock: p.current_stock ?? 0,
            }));

            let serviceItems = [];
            try {
                const { data: svcData } = await supabase
                    .from('services')
                    .select('id, name, price')
                    .eq('barbershop_id', bId)
                    .order('name');
                serviceItems = (svcData || []).map(s => ({
                    catalogId: s.id,
                    name: s.name,
                    price: parseFloat(s.price || 0),
                    item_type: 'service',
                }));
            } catch (_) { /* services table may not exist */ }

            setCatalog([...serviceItems, ...productItems]);
        }
        fetchCatalog();
    }, [order?.barbershop_id]);

    // ── Filtered catalog for dropdown ──
    const filteredCatalog = useMemo(() => {
        if (!catalogSearch.trim()) return catalog;
        const q = catalogSearch.toLowerCase();
        return catalog.filter(c => c.name.toLowerCase().includes(q));
    }, [catalog, catalogSearch]);

    // ── Cart total (real-time) ──
    const cartTotal = useMemo(() =>
        comandaItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [comandaItems]
    );

    // ── Add item from catalog ──
    function addItem(catalogItem) {
        // Stock validation for products
        if (catalogItem.item_type === 'product') {
            if ((catalogItem.current_stock ?? 0) <= 0) {
                toast.error('Produto esgotado! Não é possível adicionar ao carrinho.');
                return;
            }
            // Check if adding 1 more exceeds stock
            const existingInCart = comandaItems.find(ci =>
                ci.name === catalogItem.name && ci.item_type === 'product'
            );
            const currentQtyInCart = existingInCart ? existingInCart.quantity : 0;
            if (currentQtyInCart + 1 > catalogItem.current_stock) {
                toast.error(`Estoque insuficiente. Apenas ${catalogItem.current_stock} unidades disponíveis.`);
                return;
            }
        }

        // Check if already in cart
        const existing = comandaItems.find(ci =>
            ci.name === catalogItem.name && ci.item_type === catalogItem.item_type
        );
        if (existing) {
            setComandaItems(prev => prev.map(ci =>
                ci._localId === existing._localId
                    ? { ...ci, quantity: ci.quantity + 1 }
                    : ci
            ));
        } else {
            setComandaItems(prev => [...prev, {
                _localId: `new-${Date.now()}-${Math.random()}`,
                name: catalogItem.name,
                price: catalogItem.price,
                quantity: 1,
                item_type: catalogItem.item_type,
                catalogId: catalogItem.catalogId,
            }]);
        }
        setCatalogSearch('');
        setShowCatalog(false);
    }

    // ── Remove item ──
    function removeItem(localId) {
        setComandaItems(prev => prev.filter(ci => ci._localId !== localId));
    }

    // ── Increment / Decrement quantity ──
    function changeQty(localId, delta) {
        setComandaItems(prev => prev.map(ci => {
            if (ci._localId !== localId) return ci;
            const newQty = ci.quantity + delta;
            if (newQty < 1) return ci;

            // Stock validation for product increment
            if (delta > 0 && ci.item_type === 'product') {
                const catalogItem = catalog.find(c => c.name === ci.name && c.item_type === 'product');
                if (catalogItem && newQty > (catalogItem.current_stock ?? 0)) {
                    toast.error(`Estoque insuficiente. Apenas ${catalogItem.current_stock} unidades disponíveis de "${ci.name}".`);
                    return ci;
                }
            }

            return { ...ci, quantity: newQty };
        }));
    }

    // ── Payment methods config ──
    const paymentMethods = [
        {
            key: 'pix', label: 'PIX', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.625 13.5l3.75 3.75m0-3.75l-3.75 3.75" />
                </svg>
            )
        },
        {
            key: 'credit', label: 'Crédito', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
            )
        },
        {
            key: 'debit', label: 'Débito', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
            )
        },
        {
            key: 'cash', label: 'Dinheiro', icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
            )
        },
    ];

    // ── Finalize comanda ──
    async function handleFinalizeComanda() {
        if (!selectedPaymentMethod || finalizing) return;
        setFinalizing(true);

        try {
            const payloadItems = comandaItems.map(ci => ({
                id: ci.id,
                name: ci.name,
                price: ci.price,
                quantity: ci.quantity,
                item_type: ci.item_type,
                catalogId: ci.catalogId || catalog.find(c => c.name === ci.name && c.item_type === ci.item_type)?.catalogId
            }));

            const { error: rpcError } = await supabase.rpc('finalize_checkout', {
                p_order_id: id,
                p_total_amount: cartTotal,
                p_payment_method: selectedPaymentMethod,
                p_items: payloadItems
            });

            if (rpcError) {
                throw rpcError;
            }

            // 4. Success
            toast.success('Comanda fechada com sucesso!');
            navigate('/');
        } catch (err) {
            console.error('Erro ao fechar comanda:', err);
            // Mostrar a mensagem de erro que vem do backend, caso seja erro de estoque
            const errMsg = err.message || err.details || 'Erro ao fechar comanda. Tente novamente.';
            toast.error(errMsg);
        } finally {
            setFinalizing(false);
        }
    }

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-100">Fechamento de Comanda</h1>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Pedido ID: <span className="text-slate-400 font-mono">{id?.slice(0, 8)}...</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {order && (
                            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Comanda Aberta
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4" />
                                <p className="text-slate-500 text-sm">Carregando comanda...</p>
                            </div>
                        </div>
                    ) : !order ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-slate-400 text-sm">Comanda não encontrada.</p>
                                <button onClick={() => navigate(-1)} className="mt-4 text-red-500 text-sm hover:underline">← Voltar</button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
                            {/* ── Coluna Esquerda: Resumo da Comanda (3/5) ── */}
                            <div className="lg:col-span-3 space-y-5">
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        Resumo da Comanda
                                        <span className="ml-auto text-xs text-slate-500 font-normal">
                                            {comandaItems.length} {comandaItems.length === 1 ? 'item' : 'itens'}
                                        </span>
                                    </h2>

                                    {/* ── Item List ── */}
                                    {comandaItems.length > 0 ? (
                                        <div className="space-y-2">
                                            {comandaItems.map((item) => (
                                                <div key={item._localId} className="group/item flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${item.item_type === 'service' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                                                            }`}>
                                                            {item.item_type === 'service' ? 'S' : 'P'}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-200 truncate">{item.name}</p>
                                                            <p className="text-xs text-slate-500">
                                                                R$ {item.price.toFixed(2).replace('.', ',')} un.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Qty controls */}
                                                    <div className="flex items-center gap-2 ml-3">
                                                        <button
                                                            onClick={() => changeQty(item._localId, -1)}
                                                            className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors flex items-center justify-center text-xs font-bold"
                                                        >
                                                            −
                                                        </button>
                                                        <span className="text-sm font-bold text-slate-200 w-6 text-center">
                                                            {item.quantity}
                                                        </span>
                                                        <button
                                                            onClick={() => changeQty(item._localId, 1)}
                                                            className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors flex items-center justify-center text-xs font-bold"
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    {/* Subtotal */}
                                                    <p className="text-sm font-semibold text-red-500 w-24 text-right ml-3">
                                                        R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                                                    </p>

                                                    {/* Remove button */}
                                                    <button
                                                        onClick={() => removeItem(item._localId)}
                                                        title="Remover item"
                                                        className="ml-2 p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover/item:opacity-100"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6">
                                            <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                                            </svg>
                                            <p className="text-sm text-slate-500 italic">Nenhum item na comanda. Adicione abaixo.</p>
                                        </div>
                                    )}

                                    {/* ── Add item (Catalog combo) ── */}
                                    <div className="relative mt-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 text-lg">+</span>
                                                <input
                                                    type="text"
                                                    value={catalogSearch}
                                                    onChange={e => { setCatalogSearch(e.target.value); setShowCatalog(true); }}
                                                    onFocus={() => setShowCatalog(true)}
                                                    placeholder="Adicionar serviço ou produto..."
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                                />
                                            </div>
                                        </div>

                                        {/* Dropdown */}
                                        {showCatalog && filteredCatalog.length > 0 && (
                                            <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 max-h-52 overflow-y-auto">
                                                {filteredCatalog.map((cItem, i) => {
                                                    const isOutOfStock = cItem.item_type === 'product' && (cItem.current_stock ?? 0) <= 0;
                                                    return (
                                                        <button
                                                            key={`${cItem.item_type}-${cItem.catalogId || i}`}
                                                            onClick={() => !isOutOfStock && addItem(cItem)}
                                                            disabled={isOutOfStock}
                                                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between first:rounded-t-xl last:rounded-b-xl transition-colors ${isOutOfStock
                                                                ? 'opacity-50 cursor-not-allowed bg-slate-900/30'
                                                                : 'hover:bg-slate-700 cursor-pointer'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cItem.item_type === 'service' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                                                                    }`}>
                                                                    {cItem.item_type === 'service' ? 'SRV' : 'PRD'}
                                                                </span>
                                                                <span className="text-sm text-slate-300">{cItem.name}</span>
                                                                {isOutOfStock && (
                                                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">Esgotado</span>
                                                                )}
                                                                {cItem.item_type === 'product' && !isOutOfStock && cItem.current_stock <= 5 && (
                                                                    <span className="text-[9px] text-amber-400">({cItem.current_stock} un.)</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs font-semibold text-red-500">
                                                                R$ {cItem.price.toFixed(2).replace('.', ',')}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {showCatalog && filteredCatalog.length === 0 && catalogSearch.trim() && (
                                            <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 text-center">
                                                <p className="text-sm text-slate-500">Nenhum item encontrado.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Close catalog on outside click */}
                                    {showCatalog && (
                                        <div className="fixed inset-0 z-10" onClick={() => setShowCatalog(false)} />
                                    )}

                                    {/* Notes */}
                                    {order.notes && (
                                        <div className="mt-4 p-3 rounded-xl bg-slate-900/40 border border-slate-700/30">
                                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Observações</p>
                                            <p className="text-sm text-slate-300">{order.notes}</p>
                                        </div>
                                    )}

                                    {/* ── Total ── */}
                                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-700">
                                        <span className="text-sm text-slate-400">Total da Comanda</span>
                                        <span className="text-2xl font-bold text-red-500">
                                            R$ {cartTotal.toFixed(2).replace('.', ',')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Coluna Direita: Pagamento (2/5) ── */}
                            <div className="lg:col-span-2 space-y-5">
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                        Pagamento
                                    </h2>

                                    {/* Quick total summary */}
                                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 mb-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-400">{comandaItems.length} {comandaItems.length === 1 ? 'item' : 'itens'}</span>
                                            <span className="text-lg font-bold text-red-500">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
                                        </div>
                                    </div>

                                    {/* Payment method grid */}
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Método de Pagamento</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {paymentMethods.map(pm => (
                                            <button
                                                key={pm.key}
                                                onClick={() => setSelectedPaymentMethod(pm.key)}
                                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${selectedPaymentMethod === pm.key
                                                    ? 'border-emerald-500 bg-red-600/10 text-red-500 ring-1 ring-emerald-500/30'
                                                    : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-300'
                                                    }`}
                                            >
                                                {pm.icon}
                                                <span className="text-xs font-semibold">{pm.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Finalize button */}
                                    <button
                                        onClick={handleFinalizeComanda}
                                        disabled={!selectedPaymentMethod || finalizing || comandaItems.length === 0}
                                        className={`w-full mt-6 px-6 py-4 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 ${selectedPaymentMethod && !finalizing && comandaItems.length > 0
                                            ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/25 cursor-pointer'
                                            : 'bg-red-600/50 cursor-not-allowed opacity-50'
                                            }`}
                                    >
                                        {finalizing ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Fechando...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                                Finalizar Comanda
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
    );
}
