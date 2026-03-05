import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';

const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Estoque() {
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // ── Period filter for intelligence cards ──
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);

    // ── Core stock data ──
    const [products, setProducts] = useState([]);
    const [totalProducts, setTotalProducts] = useState(0);
    const [lowStockCount, setLowStockCount] = useState(0);

    // ── Intelligence data ──
    const [topProducts, setTopProducts] = useState([]);
    const [recompraOpportunities, setRecompraOpportunities] = useState([]);

    // ── Product Modal ──
    const [editingProduct, setEditingProduct] = useState(null);
    const [editRepurchaseDays, setEditRepurchaseDays] = useState(30);
    const [editCurrentStock, setEditCurrentStock] = useState(0);
    const [editMinStock, setEditMinStock] = useState(0);
    const [savingProduct, setSavingProduct] = useState(false);

    // ── New Product Modal ──
    const [showNewProductModal, setShowNewProductModal] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', price: '', current_stock: '', min_stock: '', repurchase_days: 30 });
    const [savingNewProduct, setSavingNewProduct] = useState(false);

    // ── Fetch barbershop_id ──
    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('id')
                .limit(1)
                .single();
            if (shop) setBarbershopId(shop.id);
            else setLoading(false);
        }
        fetchShop();
    }, []);

    // ── Master fetch ──
    const fetchData = useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const bId = barbershopId;

            // 1. All products ─ select ALL columns to avoid breaking on missing columns
            const { data: allProducts } = await supabase
                .from('products')
                .select('*')
                .eq('barbershop_id', bId)
                .order('name', { ascending: true });

            const prods = allProducts || [];
            setProducts(prods);
            setTotalProducts(prods.length);
            setLowStockCount(prods.filter(p => p.current_stock <= p.min_stock).length);

            // 2. Top Products (filtered by selectedPeriod)
            const [periodYear, periodMonth] = selectedPeriod.split('-').map(Number);
            const startOfMonth = new Date(periodYear, periodMonth - 1, 1);
            const endOfMonth = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
            const startISO = startOfMonth.toISOString();
            const endISO = endOfMonth.toISOString();

            const { data: recentOrders } = await supabase
                .from('orders')
                .select('id, order_items(name, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', startISO)
                .lte('closed_at', endISO);

            const productSales = {};
            (recentOrders || []).forEach(order => {
                (order.order_items || []).forEach(item => {
                    if (item?.item_type === 'product' && item?.name) {
                        const qty = item.quantity || 1;
                        if (!productSales[item.name]) productSales[item.name] = 0;
                        productSales[item.name] += qty;
                    }
                });
            });

            const topSorted = Object.entries(productSales)
                .map(([nome, qtd]) => ({ nome, qtd }))
                .sort((a, b) => b.qtd - a.qtd)
                .slice(0, 5);
            setTopProducts(topSorted);

            // 3. Repurchase Intelligence — per-product repurchase_days
            // Build a map of product name → repurchase_days
            const repurchaseDaysMap = {};
            prods.forEach(p => {
                repurchaseDaysMap[p.name] = p.repurchase_days || 30;
            });

            // Find furthest repurchase window needed
            const maxRepurchase = Math.max(...Object.values(repurchaseDaysMap), 30) + 15;
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - maxRepurchase);

            // Fetch all closed orders within the lookback window
            const { data: allClosedOrders } = await supabase
                .from('orders')
                .select('id, client_id, closed_at, order_items(name, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', lookbackDate.toISOString());

            // Build per-client, per-product most recent purchase date
            const latestPurchaseMap = {}; // key: clientId::productName → { date, clientId, produto }
            (allClosedOrders || []).forEach(order => {
                if (!order.client_id) return;
                (order.order_items || []).forEach(item => {
                    if (item?.item_type === 'product' && item?.name) {
                        const key = `${order.client_id}::${item.name}`;
                        const orderDate = new Date(order.closed_at);
                        if (!latestPurchaseMap[key] || orderDate > new Date(latestPurchaseMap[key].data)) {
                            latestPurchaseMap[key] = {
                                clientId: order.client_id,
                                produto: item.name,
                                data: order.closed_at,
                            };
                        }
                    }
                });
            });

            // Filter candidates using the Golden Rule:
            // diasPassados >= repurchase_days AND diasPassados <= repurchase_days + 15 AND diasPassados >= 10
            const today = new Date();
            const candidates = Object.values(latestPurchaseMap).filter(c => {
                const d = new Date(c.data);
                const diasPassados = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                const repDays = repurchaseDaysMap[c.produto] || 30;
                return diasPassados >= 10 && diasPassados >= repDays && diasPassados <= (repDays + 15);
            });

            // Resolve client names & phones
            const clientIds = [...new Set(candidates.map(c => c.clientId).filter(Boolean))];
            let clientMap = {};
            if (clientIds.length > 0) {
                const { data: clients } = await supabase
                    .from('clients')
                    .select('id, name, phone')
                    .in('id', clientIds);
                (clients || []).forEach(c => { clientMap[c.id] = { name: c.name, phone: c.phone || '' }; });
            }

            const recompraList = candidates.map(c => {
                const info = clientMap[c.clientId] || { name: 'Sem nome', phone: '' };
                const d = new Date(c.data);
                const diasAtras = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
                const repDays = repurchaseDaysMap[c.produto] || 30;
                const phoneClean = (info.phone || '').replace(/\D/g, '');
                return {
                    nome: info.name,
                    produto: c.produto,
                    diasAtras,
                    repurchaseDays: repDays,
                    whatsapp: phoneClean ? `https://wa.me/55${phoneClean}` : '',
                };
            }).sort((a, b) => b.diasAtras - a.diasAtras);

            setRecompraOpportunities(recompraList);

        } catch (err) {
            console.error('Erro ao buscar estoque:', err);
        } finally {
            setLoading(false);
        }
    }, [barbershopId, selectedPeriod]);

    useEffect(() => {
        if (barbershopId) fetchData();
    }, [barbershopId, fetchData]);

    // ── Product modal handlers ──
    const openEditModal = (product) => {
        setEditingProduct(product);
        setEditRepurchaseDays(product.repurchase_days || 30);
        setEditCurrentStock(product.current_stock || 0);
        setEditMinStock(product.min_stock || 0);
    };

    const handleSaveProduct = async () => {
        if (!editingProduct) return;
        setSavingProduct(true);
        try {
            const { error } = await supabase
                .from('products')
                .update({
                    repurchase_days: editRepurchaseDays,
                    current_stock: editCurrentStock,
                    min_stock: editMinStock
                })
                .eq('id', editingProduct.id);
            if (error) throw error;
            setEditingProduct(null);
            fetchData();
        } catch (err) {
            alert(`Erro ao salvar: ${err.message}`);
        } finally {
            setSavingProduct(false);
        }
    };

    // ── New product handler ──
    const handleCreateProduct = async () => {
        if (!newProduct.name.trim()) { alert('Nome é obrigatório.'); return; }
        setSavingNewProduct(true);
        try {
            const { error } = await supabase.from('products').insert({
                barbershop_id: barbershopId,
                name: newProduct.name.trim(),
                price: parseFloat(newProduct.price) || 0,
                current_stock: parseInt(newProduct.current_stock) || 0,
                min_stock: parseInt(newProduct.min_stock) || 0,
                repurchase_days: parseInt(newProduct.repurchase_days) || 30,
            });
            if (error) throw error;
            setShowNewProductModal(false);
            setNewProduct({ name: '', price: '', current_stock: '', min_stock: '', repurchase_days: 30 });
            fetchData();
        } catch (err) {
            alert(`Erro ao criar produto: ${err.message}`);
        } finally {
            setSavingNewProduct(false);
        }
    };

    // ── Filtered products ──
    const filteredProducts = products.filter(p => {
        // Search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            if (!p.name?.toLowerCase().includes(term)) return false;
        }
        // Status filter
        if (statusFilter === 'empty') return (p.current_stock ?? 0) <= 0;
        if (statusFilter === 'low') return (p.current_stock ?? 0) > 0 && (p.current_stock ?? 0) <= (p.min_stock ?? 0);
        if (statusFilter === 'ok') return (p.current_stock ?? 0) > (p.min_stock ?? 0);
        return true; // 'all'
    });

    // ── Render ──
    if (loading && products.length === 0) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-500 text-sm">Carregando estoque...</p>
                    </div>
                </main>
            </div>
        );
    }

    const medals = ['🥇', '🥈', '🥉'];

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── HEADER ── */}
                <header className="h-[72px] bg-slate-800 border-b border-slate-700 flex items-center justify-between px-8 flex-shrink-0">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-100">Estoque</h1>
                        <p className="text-xs text-slate-500">Controle de Produtos e Inteligência de Vendas</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-400">Período:</label>
                            <input
                                type="month"
                                value={selectedPeriod}
                                onChange={(e) => setSelectedPeriod(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors [color-scheme:dark]"
                            />
                        </div>
                        <button
                            onClick={() => setShowNewProductModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-red-600/20"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            Novo Produto
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {/* ══════════ KPI Cards ══════════ */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Produtos</p>
                            </div>
                            <p className="text-3xl font-bold text-slate-100">{totalProducts}</p>
                        </div>
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Estoque Crítico</p>
                            </div>
                            <p className="text-3xl font-bold text-rose-400">{lowStockCount}</p>
                            <p className="text-[10px] text-slate-600 mt-1">Abaixo do mínimo</p>
                        </div>
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Oportunidades Recompra</p>
                            </div>
                            <p className="text-3xl font-bold text-amber-400">{recompraOpportunities.length}</p>
                            <p className="text-[10px] text-slate-600 mt-1">Clientes para contato</p>
                        </div>
                    </div>

                    {/* ══════════ Produtos Mais Vendidos (30 dias) + Recompra ══════════ */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Top Products */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                            <h2 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
                                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.48-.228M7.73 9.728a6.008 6.008 0 002.48.228m0 0c.855 0 1.683-.115 2.48-.228" />
                                </svg>
                                Produtos Mais Vendidos
                            </h2>
                            <p className="text-[10px] text-slate-500 mb-4">
                                {new Date(selectedPeriod + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </p>
                            {topProducts.length === 0 ? (
                                <div className="flex items-center justify-center h-40 text-slate-600 text-sm">
                                    Nenhuma venda de produto registrada
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {topProducts.map((p, i) => {
                                        const maxQtd = topProducts[0]?.qtd || 1;
                                        const pct = (p.qtd / maxQtd) * 100;
                                        const colors = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171'];
                                        return (
                                            <div key={p.nome} className="flex items-center gap-3">
                                                <span className="w-8 text-center text-lg flex-shrink-0">
                                                    {i < 3 ? medals[i] : <span className="text-xs text-slate-600 font-bold">{i + 1}º</span>}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-sm text-slate-300 font-medium truncate">{p.nome}</span>
                                                        <span className="text-xs font-bold text-red-500 flex-shrink-0 ml-2">{p.qtd} un.</span>
                                                    </div>
                                                    <div className="w-full bg-slate-900 rounded-full h-2">
                                                        <div
                                                            className="h-2 rounded-full transition-all duration-500"
                                                            style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Oportunidades de Recompra 🎯 */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                            <h2 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
                                🎯 Oportunidades de Recompra
                            </h2>
                            <p className="text-[10px] text-slate-500 mb-4">Baseado em repurchase_days de cada produto (mín. 10 dias)</p>
                            {recompraOpportunities.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                                    <svg className="w-10 h-10 text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm">Nenhuma oportunidade no momento</p>
                                    <p className="text-[10px] text-slate-700 mt-0.5">Tudo certo ✓</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                                    {recompraOpportunities.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700/40 hover:border-amber-500/30 transition-colors group">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-slate-200 truncate">{r.nome}</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    Comprou <span className="text-amber-400 font-semibold">{r.produto}</span> há <span className="text-amber-400 font-semibold">{r.diasAtras} dias</span>. Tempo médio de recompra: <span className="text-blue-400 font-semibold">{r.repurchaseDays} dias</span>.
                                                </p>
                                                <p className="text-[10px] text-slate-600 mt-0.5 italic">Ofereça refil!</p>
                                            </div>
                                            {r.whatsapp && (
                                                <a
                                                    href={r.whatsapp}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-9 h-9 rounded-xl bg-red-600/15 flex items-center justify-center text-red-500 hover:bg-emerald-500/30 transition-all flex-shrink-0 ml-3"
                                                    onClick={e => e.stopPropagation()}
                                                    title="Enviar WhatsApp"
                                                >
                                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                    </svg>
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ══════════ Search Bar + Status Filter ══════════ */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Pesquisar produtos..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/30 transition-all"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/30 transition-all appearance-none cursor-pointer min-w-[140px]"
                        >
                            <option value="all">Todos</option>
                            <option value="ok">✅ OK</option>
                            <option value="low">⚠️ Baixo</option>
                            <option value="empty">🛑 Esgotado</option>
                        </select>
                    </div>

                    {/* ══════════ Tabela de Produtos ══════════ */}
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Produto</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filial</th>
                                        <th className="text-center px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Estoque Atual</th>
                                        <th className="text-center px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mínimo</th>
                                        <th className="text-center px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="text-right px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Preço</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                                                {(searchTerm || statusFilter !== 'all') ? 'Nenhum produto encontrado para os filtros selecionados.' : 'Nenhum produto cadastrado.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProducts.map((p) => {
                                            const isLow = p.current_stock <= p.min_stock;
                                            const isCritical = p.current_stock === 0;
                                            return (
                                                <tr key={p.id} onClick={() => openEditModal(p)} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer" title="Clique para editar">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isCritical ? 'bg-rose-500/15 text-rose-400'
                                                                : isLow ? 'bg-amber-500/15 text-amber-400'
                                                                    : 'bg-red-600/15 text-red-500'
                                                                }`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                                </svg>
                                                            </div>
                                                            <span className="font-medium text-slate-200">{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400">{p.branch_name || '—'}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`font-bold ${isCritical ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-200'}`}>
                                                            {p.current_stock}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-slate-400">{p.min_stock}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        {isCritical ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20">
                                                                Esgotado
                                                            </span>
                                                        ) : isLow ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20">
                                                                Baixo
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-600/10 text-red-500 ring-1 ring-inset ring-red-600/20">
                                                                OK
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-semibold text-slate-200">{formatBRL(p.price)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>

            {/* ════════ PRODUCT EDIT MODAL ════════ */}
            {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingProduct(null)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">Editar Produto</h3>
                                    <p className="text-xs text-slate-500">{editingProduct.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setEditingProduct(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Read-only info */}
                            <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50 mb-2">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Preço</p>
                                <p className="text-sm font-bold text-red-500">{formatBRL(editingProduct.price)}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estoque Atual</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editCurrentStock}
                                        onChange={e => setEditCurrentStock(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estoque Mínimo</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editMinStock}
                                        onChange={e => setEditMinStock(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Repurchase days field */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Dias para Recompra</label>
                                <p className="text-[10px] text-slate-500 mb-2">Avisar cliente após X dias da última compra deste produto</p>
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={editRepurchaseDays}
                                    onChange={e => setEditRepurchaseDays(parseInt(e.target.value) || 30)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-700">
                            <button onClick={() => setEditingProduct(null)} disabled={savingProduct} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleSaveProduct} disabled={savingProduct} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
                                {savingProduct && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {savingProduct ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════ NEW PRODUCT MODAL ════════ */}
            {showNewProductModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowNewProductModal(false)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">Novo Produto</h3>
                                    <p className="text-xs text-slate-500">Cadastrar produto no estoque</p>
                                </div>
                            </div>
                            <button onClick={() => setShowNewProductModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nome do Produto *</label>
                                <input
                                    type="text"
                                    value={newProduct.name}
                                    onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Ex: Pomada Modeladora"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preço (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newProduct.price}
                                    onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))}
                                    placeholder="0,00"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estoque Atual</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newProduct.current_stock}
                                        onChange={e => setNewProduct(p => ({ ...p, current_stock: e.target.value }))}
                                        placeholder="0"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Estoque Mínimo</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newProduct.min_stock}
                                        onChange={e => setNewProduct(p => ({ ...p, min_stock: e.target.value }))}
                                        placeholder="0"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Dias para Recompra</label>
                                <p className="text-[10px] text-slate-500 mb-2">Avisar cliente após X dias (default: 30)</p>
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={newProduct.repurchase_days}
                                    onChange={e => setNewProduct(p => ({ ...p, repurchase_days: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-700">
                            <button onClick={() => setShowNewProductModal(false)} disabled={savingNewProduct} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleCreateProduct} disabled={savingNewProduct} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
                                {savingNewProduct && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {savingNewProduct ? 'Salvando...' : 'Cadastrar Produto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
