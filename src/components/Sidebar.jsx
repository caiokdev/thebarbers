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
    const [adminName, setAdminName] = useState('');
    const [adminInitials, setAdminInitials] = useState('');

    useEffect(() => {
        async function fetchSidebarData() {
            try {
                const { data: shop } = await supabase
                    .from('barbershops')
                    .select('id, name')
                    .limit(1)
                    .single();

                if (shop) {
                    const { data: admin } = await supabase
                        .from('profiles')
                        .select('name')
                        .eq('barbershop_id', shop.id)
                        .eq('role', 'admin')
                        .limit(1)
                        .single();

                    if (admin?.name) {
                        setAdminName(admin.name);
                        const parts = admin.name.split(' ');
                        setAdminInitials(
                            parts.length >= 2
                                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                                : admin.name.substring(0, 2).toUpperCase()
                        );
                    }
                }
            } catch (_) { }
        }
        fetchSidebarData();
    }, []);

    return (
        <aside className="w-[260px] h-full flex flex-col flex-shrink-0" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            {/* ── Logo Header ── */}
            <div className="h-[80px] flex items-center gap-3 px-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Official circular logo */}
                <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden" style={{ border: '2px solid #B59410', boxShadow: '0 0 12px rgba(181,148,16,0.3)' }}>
                    <img src="/logo.png" alt="The Barbers" className="w-full h-full object-cover" />
                </div>
                <div>
                    <p className="font-black text-white tracking-wide text-sm leading-tight" style={{ letterSpacing: '0.08em' }}>THE</p>
                    <p className="font-black tracking-widest text-xs leading-tight" style={{ color: '#B59410', letterSpacing: '0.25em' }}>BARBERS</p>
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
            <div className="px-4 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #B59410 0%, #8a700b 100%)', boxShadow: '0 2px 8px rgba(181,148,16,0.25)' }}>
                        {adminInitials || 'AD'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{adminName || 'Admin'}</p>
                        <p className="text-[11px]" style={{ color: '#B59410' }}>Administrador</p>
                    </div>
                    {/* Lock icon */}
                    <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                </div>
            </div>
        </aside>
    );
}
