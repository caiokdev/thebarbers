import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const GlobalDataContext = createContext(null);

export function GlobalDataProvider({ children }) {
    const [data, setData] = useState({
        adminProfile: null,
        stats: {
            clientsCount: 0,
            activeSubsCount: 0,
        },
        loading: true,
        error: null
    });

    const [refetchKey, setRefetchKey] = useState(0);

    const fetchData = useCallback(async () => {
        try {
            // Get Barbershop ID first
            const { data: shop, error: shopErr } = await supabase
                .from('barbershops')
                .select('id, name, address, phone, noshow_active')
                .limit(1)
                .single();

            if (shopErr || !shop) throw new Error('Barbearia não encontrada');

            const bId = shop.id;

            // Fetch everything in parallel - removed .order('name') on tables without 'name' column
            const [adminRes, clientsRes, prosRes, profilesProsRes, servicesRes, productsRes, bhRes, plansRes] = await Promise.all([
                supabase.from('profiles').select('name').eq('barbershop_id', bId).eq('role', 'admin').limit(1).maybeSingle(),
                supabase.from('clients').select('id, name, phone, is_subscriber, subscription_status, birth_date').eq('barbershop_id', bId),
                supabase.from('professionals').select('id, name, specialty').eq('barbershop_id', bId).eq('role', 'barber'),
                supabase.from('profiles').select('id, name, commission_rate').eq('barbershop_id', bId).eq('role', 'barber'),
                supabase.from('services').select('id, name, price').eq('barbershop_id', bId),
                supabase.from('products').select('id, name, price, current_stock').eq('barbershop_id', bId),
                supabase.from('business_hours').select('*').eq('barbershop_id', bId),
                supabase.from('plans').select('*').eq('barbershop_id', bId)
            ]);


            const adminName = adminRes.data?.name || 'Admin';
            const nameParts = adminName.split(' ');
            const adminInitials = nameParts.length >= 2
                ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                : adminName.substring(0, 2).toUpperCase();

            const mergedPros = [
                ...(prosRes.data || []),
                ...(profilesProsRes.data || [])
            ].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

            setData({
                adminProfile: {
                    name: adminName,
                    initials: adminInitials,
                    barbershopId: bId,
                    barbershopName: shop.name,
                    barbershopAddress: shop.address,
                    barbershopPhone: shop.phone,
                    noshowActive: shop.noshow_active ?? false
                },
                stats: {
                    clientsCount: clientsRes.data?.length || 0,
                    activeSubsCount: (clientsRes.data || []).filter(c => c.is_subscriber).length,
                },
                professionals: mergedPros,
                clients: clientsRes.data || [],
                services: servicesRes.data || [],
                products: productsRes.data || [],
                businessHours: bhRes.data || [],
                plans: plansRes.data || [],
                loading: false,
                error: null
            });
        } catch (err) {
            console.error('Error fetching global data:', err);
            setData(prev => ({
                ...prev,
                loading: false,
                error: err.message
            }));
        }
    }, []);

    // Initial fetch and focus-based refresh
    useEffect(() => {
        fetchData();

        const handleFocus = () => {
            console.log('Window focused, refreshing global data...');
            fetchData();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchData, refetchKey]);

    const value = {
        ...data,
        refreshData: () => setRefetchKey(k => k + 1)
    };

    return (
        <GlobalDataContext.Provider value={value}>
            {children}
        </GlobalDataContext.Provider>
    );
}

export function useGlobalData() {
    const context = useContext(GlobalDataContext);
    if (!context) {
        throw new Error('useGlobalData must be used within a GlobalDataProvider');
    }
    return context;
}
