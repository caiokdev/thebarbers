import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const menuItems = [
    {
        label: 'Dashboard',
        path: '/',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
        ),
    },
    {
        label: 'Agenda',
        path: '/agenda',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
    },
    {
        label: 'Financeiro',
        path: '/financeiro',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        label: 'Clientes',
        path: '/clientes',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
    },
    {
        label: 'Estoque',
        path: '/estoque',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        ),
    },
    {
        label: 'Relatórios',
        path: '/relatorios',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
        ),
    },
    {
        label: 'Automações',
        path: '/automacoes',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
        ),
    },
    {
        label: 'Planos',
        path: '/planos',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
        ),
    },
    {
        label: 'Configurações',
        path: '/configuracoes',
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
];

export default function Sidebar() {
    const [shopName, setShopName] = useState('THE BARBERS');
    const [shopLogo, setShopLogo] = useState(localStorage.getItem('shop_logo') || '/logo.png');

    // Admin profile state
    const [shopId, setShopId] = useState(null);
    const [adminName, setAdminName] = useState('');
    const [adminInitials, setAdminInitials] = useState('');
    const [adminId, setAdminId] = useState(null);
    const [adminPhone, setAdminPhone] = useState(localStorage.getItem('admin_phone') || '');
    const [adminPhoto, setAdminPhoto] = useState(localStorage.getItem('admin_photo') || '');

    // Modal state
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordError, setIsPasswordError] = useState(false);
    const [checkingPassword, setCheckingPassword] = useState(false);

    // Edit form state
    const [editForm, setEditForm] = useState({ name: '', phone: '', photo: '', password: '' });
    const [savingProfile, setSavingProfile] = useState(false);

    // Initial fetch
    useEffect(() => {
        async function fetchSidebarData() {
            try {
                const { data: shop } = await supabase
                    .from('barbershops')
                    .select('id, name')
                    .limit(1)
                    .single();

                if (shop) {
                    setShopId(shop.id);
                    if (shop.name) {
                        const parts = shop.name.trim().split(' ');
                        const shortName = parts.length > 1
                            ? `${parts[0]} ${parts[parts.length - 1]}`
                            : shop.name;
                        setShopName(shortName.toUpperCase());
                    }

                    const { data: admin } = await supabase
                        .from('profiles')
                        .select('id, name')
                        .eq('barbershop_id', shop.id)
                        .eq('role', 'admin')
                        .limit(1)
                        .single();

                    if (admin?.name) {
                        setAdminId(admin.id);
                        setAdminName(admin.name);
                        const parts = admin.name.split(' ');
                        setAdminInitials(
                            parts.length >= 2
                                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                                : admin.name.substring(0, 2).toUpperCase()
                        );
                        setEditForm(prev => ({ ...prev, name: admin.name }));
                    }
                }
            } catch (_) { }
        }
        fetchSidebarData();

        const handleLogoUpdate = () => {
            const local = localStorage.getItem('shop_logo');
            setShopLogo(local ? local : '/logo.png');
        };
        window.addEventListener('shop_logo_updated', handleLogoUpdate);
        return () => window.removeEventListener('shop_logo_updated', handleLogoUpdate);

    }, []);

    const handleProfileClick = () => {
        setEditForm(prev => ({
            ...prev,
            phone: localStorage.getItem('admin_phone') || '',
            photo: localStorage.getItem('admin_photo') || '',
            password: '' 
        }));
        setIsProfileModalOpen(true);
    };

    const handleUnlock = async () => {
        if (!passwordInput || !shopId) {
            setIsPasswordError(true);
            return;
        }
        setCheckingPassword(true);
        try {
            const { data: isValid, error } = await supabase.rpc('verify_master_password', {
                p_barbershop_id: shopId,
                p_password: passwordInput
            });
            
            if (error) throw error;
            
            if (isValid) {
                setIsPasswordModalOpen(false);
                setEditForm(prev => ({
                    ...prev,
                    phone: localStorage.getItem('admin_phone') || '',
                    photo: localStorage.getItem('admin_photo') || '',
                    password: '' // empty so we don't expose current hash/password
                }));
                setIsProfileModalOpen(true);
            } else {
                setIsPasswordError(true);
            }
        } catch (err) {
            console.error('Erro ao verificar senha master:', err);
            setIsPasswordError(true);
        } finally {
            setCheckingPassword(false);
        }
    };

    const handleAdminPhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX = 200;
                if (width > height) {
                    if (width > MAX) { height *= MAX / width; width = MAX; }
                } else {
                    if (height > MAX) { width *= MAX / height; height = MAX; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                setEditForm(prev => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.8) }));
                e.target.value = '';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async () => {
        if (!editForm.name.trim()) return alert('Nome é obrigatório');
        setSavingProfile(true);
        try {
            if (adminId) {
                // Save name to Supabase
                const { error } = await supabase.from('profiles').update({ name: editForm.name }).eq('id', adminId);
                if (error) throw error;
            }
            // Save locals for device-specific preferences
            localStorage.setItem('admin_phone', editForm.phone);
            localStorage.setItem('admin_photo', editForm.photo);
            localStorage.removeItem('admin_password'); // limpa legados inseguros

            if (editForm.password && editForm.password.trim() !== '') {
                const { error: rpcError } = await supabase.rpc('set_master_password', {
                    p_barbershop_id: shopId,
                    p_password: editForm.password.trim()
                });
                if (rpcError) throw rpcError;
            }

            // Sync local states
            setAdminName(editForm.name);
            setAdminPhone(editForm.phone);
            setAdminPhoto(editForm.photo);
            const parts = editForm.name.split(' ');
            setAdminInitials(
                parts.length >= 2
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : editForm.name.substring(0, 2).toUpperCase()
            );

            setIsProfileModalOpen(false);
            alert('Perfil atualizado com sucesso!');
        } catch (err) {
            alert(`Erro ao salvar: ${err.message}`);
        } finally {
            setSavingProfile(false);
        }
    };

    return (
        <aside className="w-[260px] h-full flex flex-col flex-shrink-0" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            {/* ── Logo Header ── */}
            <div className="h-[80px] flex items-center gap-3 px-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Official circular logo */}
                <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-slate-800" style={{ border: '2px solid #B59410', boxShadow: '0 0 12px rgba(181,148,16,0.3)' }}>
                    <img src={shopLogo} alt="Logo" className="w-full h-full object-cover" onError={(e) => e.target.src = '/logo.png'} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-sm leading-tight truncate">{shopName.split(' ')[0]}</p>
                    <p className="font-black text-xs leading-tight truncate" style={{ color: '#B59410' }}>{shopName.split(' ').slice(1).join(' ') || 'BARBERS'}</p>
                </div>
            </div>

            {/* ── Navigation ── */}
            <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
                {menuItems.map((item, i) => (
                    <NavLink
                        key={i}
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                            `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                ? 'bg-gradient-to-r from-red-600/20 to-red-600/5 text-white border border-red-600/30'
                                : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`transition-colors ${isActive ? 'text-red-500' : 'text-slate-600 group-hover:text-slate-300'}`}>
                                    {item.icon}
                                </span>
                                <span>{item.label}</span>
                                {/* Active indicator bar */}
                                {isActive && (
                                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* ── Bottom Profile ── */}
            <div className="px-4 py-4 flex-shrink-0 cursor-pointer hover:bg-white/5 transition-colors" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} onClick={handleProfileClick}>
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #B59410 0%, #8a700b 100%)', boxShadow: '0 2px 8px rgba(181,148,16,0.25)' }}>
                        {adminPhoto ? (
                            <img src={adminPhoto} alt={adminName} className="w-full h-full object-cover" />
                        ) : (
                            adminInitials || 'AD'
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{adminName || 'Admin'}</p>
                        <p className="text-[11px]" style={{ color: '#B59410' }}>Administrador</p>
                    </div>
                    {/* Settings cog icon instead of lock */}
                    <svg className="w-4 h-4 text-slate-500 hover:text-white transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
            </div>

            {/* ════════ PASSWORD MODAL ════════ */}
            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPasswordModalOpen(false)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">Acesso Restrito</h3>
                            <p className="text-xs text-slate-400 mb-6">Digite sua senha para acessar o perfil</p>

                            <input
                                type="password"
                                value={passwordInput}
                                onChange={e => setPasswordInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                placeholder="Sua senha..."
                                className={`w-full bg-slate-900 border ${isPasswordError ? 'border-rose-500' : 'border-slate-700'} rounded-xl px-4 py-3 text-sm text-center text-white focus:outline-none focus:border-red-500 mb-4 transition-colors`}
                                autoFocus
                            />

                            {isPasswordError && (
                                <p className="text-xs text-rose-400 mb-4 font-medium">Senha incorreta. Tente novamente.</p>
                            )}

                            <div className="flex w-full gap-3">
                                <button onClick={() => setIsPasswordModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleUnlock} disabled={checkingPassword} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center">
                                    {checkingPassword ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Entrar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════ PROFILE CONFIG MODAL ════════ */}
            {isProfileModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsProfileModalOpen(false)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white">Perfil do Administrador</h3>
                            <button onClick={() => setIsProfileModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Nome</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">WhatsApp</label>
                                <input type="text" value={editForm.phone} onChange={e => { let val = e.target.value.replace(/\D/g, ''); if (val.length > 11) val = val.slice(0, 11); if (val.length > 7) { val = `(${val.slice(0,2)}) ${val.slice(2,7)}-${val.slice(7)}`; } else if (val.length > 2) { val = `(${val.slice(0,2)}) ${val.slice(2)}`; } setEditForm({ ...editForm, phone: val }); }} placeholder="(11) 99999-9999" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Foto de Perfil</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                        {editForm.photo ? (
                                            <img src={editForm.photo} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input type="file" accept="image/*" onChange={handleAdminPhotoUpload} className="hidden" id="adminAvatarUpload" />
                                        <label htmlFor="adminAvatarUpload" className="inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-sm mb-1">
                                            Escolher Imagem
                                        </label>
                                        <p className="text-[10px] text-slate-500">Selecione uma imagem do seu dispositivo.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-700 mt-2">
                                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5 mt-2">Nova Senha de Acesso</label>
                                <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="Manter a mesma" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500" />
                                <p className="text-[10px] text-slate-500 mt-1">Essa senha é usada para entrar neste painel e na área de comissões.</p>
                            </div>
                        </div>

                        <button onClick={handleSaveProfile} disabled={savingProfile} className="w-full mt-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-600/20 flex items-center justify-center gap-2">
                            {savingProfile && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
