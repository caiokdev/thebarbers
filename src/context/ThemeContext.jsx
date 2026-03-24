import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const THEME_COLORS = {
    rose: {
        primary: 'rose',
        bg: 'bg-rose-600',
        bgHover: 'hover:bg-rose-700',
        bgLight: 'bg-rose-600/15',
        text: 'text-rose-500',
        textDark: 'text-rose-600',
        border: 'border-rose-600',
        borderLight: 'border-rose-600/30',
        shadow: 'shadow-rose-600/20',
        ring: 'ring-rose-600/30',
        focusBorder: 'focus:border-rose-600',
        focusRing: 'focus:ring-rose-600/30',
        borderTop: 'border-t-rose-600',
    },
    emerald: {
        primary: 'emerald',
        bg: 'bg-emerald-500',
        bgHover: 'hover:bg-emerald-600',
        bgLight: 'bg-emerald-500/15',
        text: 'text-emerald-400',
        textDark: 'text-emerald-500',
        border: 'border-emerald-500',
        borderLight: 'border-emerald-500/30',
        shadow: 'shadow-emerald-500/20',
        ring: 'ring-emerald-500/30',
        focusBorder: 'focus:border-emerald-500',
        focusRing: 'focus:ring-emerald-500/30',
        borderTop: 'border-t-emerald-500',
    },
    purple: {
        primary: 'purple',
        bg: 'bg-purple-500',
        bgHover: 'hover:bg-purple-600',
        bgLight: 'bg-purple-500/15',
        text: 'text-purple-400',
        textDark: 'text-purple-500',
        border: 'border-purple-500',
        borderLight: 'border-purple-500/30',
        shadow: 'shadow-purple-500/20',
        ring: 'ring-purple-500/30',
        focusBorder: 'focus:border-purple-500',
        focusRing: 'focus:ring-purple-500/30',
        borderTop: 'border-t-purple-500',
    },
    blue: {
        primary: 'blue',
        bg: 'bg-blue-500',
        bgHover: 'hover:bg-blue-600',
        bgLight: 'bg-blue-500/15',
        text: 'text-blue-400',
        textDark: 'text-blue-500',
        border: 'border-blue-500',
        borderLight: 'border-blue-500/30',
        shadow: 'shadow-blue-500/20',
        ring: 'ring-blue-500/30',
        focusBorder: 'focus:border-blue-500',
        focusRing: 'focus:ring-blue-500/30',
        borderTop: 'border-t-blue-500',
    },
    amber: {
        primary: 'amber',
        bg: 'bg-amber-500',
        bgHover: 'hover:bg-amber-600',
        bgLight: 'bg-amber-500/15',
        text: 'text-amber-400',
        textDark: 'text-amber-500',
        border: 'border-amber-500',
        borderLight: 'border-amber-500/30',
        shadow: 'shadow-amber-500/20',
        ring: 'ring-amber-500/30',
        focusBorder: 'focus:border-amber-500',
        focusRing: 'focus:ring-amber-500/30',
        borderTop: 'border-t-amber-500',
    },
    cyan: {
        primary: 'cyan',
        bg: 'bg-cyan-500',
        bgHover: 'hover:bg-cyan-600',
        bgLight: 'bg-cyan-500/15',
        text: 'text-cyan-400',
        textDark: 'text-cyan-500',
        border: 'border-cyan-500',
        borderLight: 'border-cyan-500/30',
        shadow: 'shadow-cyan-500/20',
        ring: 'ring-cyan-500/30',
        focusBorder: 'focus:border-cyan-500',
        focusRing: 'focus:ring-cyan-500/30',
        borderTop: 'border-t-cyan-500',
    },
};

const ThemeContext = createContext({
    theme: THEME_COLORS.rose,
    themeColor: 'rose',
    updateThemeColor: () => { },
    THEME_COLORS,
});

export function ThemeProvider({ children }) {
    const [themeColor, setThemeColor] = useState('rose'); // Default: The Barbers brand red

    useEffect(() => {
        let mounted = true;
        async function loadTheme() {
            try {
                const { data: shop, error } = await supabase
                    .from('barbershops')
                    .select('id, theme_color')
                    .limit(1)
                    .single();
                
                if (error) {
                    if (error.code !== 'PGRST116') console.error('Error loading theme:', error);
                    return;
                }

                if (mounted && shop?.theme_color && THEME_COLORS[shop.theme_color]) {
                    setThemeColor(shop.theme_color);
                }
            } catch (err) {
                console.error('Failed to load theme:', err);
            }
        }
        loadTheme();

        // Listen for realtime changes
        const channel = supabase
            .channel('theme-color-changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'barbershops' }, (payload) => {
                if (mounted && payload.new?.theme_color && THEME_COLORS[payload.new.theme_color]) {
                    setThemeColor(payload.new.theme_color);
                }
            })
            .subscribe();

        return () => { 
            mounted = false;
            supabase.removeChannel(channel); 
        };
    }, []);

    const theme = THEME_COLORS[themeColor] || THEME_COLORS.rose;

    const updateThemeColor = async (color, barbershopId) => {
        if (!THEME_COLORS[color]) return;
        setThemeColor(color);
        try {
            const { error } = await supabase
                .from('barbershops')
                .update({ theme_color: color })
                .eq('id', barbershopId);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to update theme color:', err);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, themeColor, updateThemeColor, THEME_COLORS }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        console.warn('useTheme must be used within a ThemeProvider. Falling back to default theme.');
        return {
            theme: THEME_COLORS.rose,
            themeColor: 'rose',
            updateThemeColor: () => { },
            THEME_COLORS,
        };
    }
    return ctx;
}

export { THEME_COLORS };
