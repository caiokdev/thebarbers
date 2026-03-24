import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

/**
 * A wrapper component that protects routes from unauthenticated access.
 * Redirects to /login if no valid session is found.
 */
export default function PrivateRoute({ children }) {
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const location = useLocation();

    useEffect(() => {
        let mounted = true;

        const checkAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (mounted) {
                    setAuthenticated(!!session);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Erro na verificação de autenticação:', error);
                if (mounted) {
                    setAuthenticated(false);
                    setLoading(false);
                }
            }
        };

        checkAuth();

        // Listen for auth state changes (login, logout, token refresh failure)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (mounted) {
                setAuthenticated(!!session);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    if (loading) {
        return (
            <div className="flex h-screen bg-[#0a0a0a] items-center justify-center">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-red-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!authenticated) {
        // Redirect to login, but save the location they were trying to go to
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}
