import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function NotFound() {
    const { theme } = useTheme();

    return (
        <div className="flex h-screen bg-slate-950 items-center justify-center font-sans p-6 text-center">
            <div className="max-w-md">
                <div className={`text-6xl font-black mb-4 ${theme.text}`}>404</div>
                <h1 className="text-3xl font-bold text-white mb-6">Página não encontrada</h1>
                <p className="text-slate-400 mb-8">
                    Ops! Parece que você tentou acessar um link que não existe ou foi removido.
                </p>
                <Link
                    to="/"
                    className={`inline-block px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all hover:brightness-110 ${theme.bg}`}
                >
                    Voltar para o Dashboard
                </Link>
            </div>
        </div>
    );
}
