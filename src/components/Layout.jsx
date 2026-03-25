import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useGlobalData } from '../context/GlobalDataContext';

export default function Layout() {
    const { adminProfile, stats, loading, error } = useGlobalData();

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Header 
                    userName={adminProfile?.name} 
                    totalClientes={stats?.clientsCount} 
                    totalAssinantes={stats?.activeSubsCount} 
                    hideSearch={true} 
                    hideNotifications={true} 
                />


                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                    {loading && (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                        </div>
                    )}
                    
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl">
                            <p className="text-red-400 text-sm">Aviso: Erro ao carregar dados do perfil. Algumas informações podem estar desatualizadas.</p>
                        </div>
                    )}

                    {!loading && <Outlet />}
                </div>
            </main>
        </div>
    );
}
