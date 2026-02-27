import React from 'react';

export default function Header() {
    return (
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">
            <div className="text-gray-600 font-medium">
                Dashboard / Operacional
            </div>
            <div className="flex items-center gap-3">
                <span className="text-gray-800 font-medium">Lucas Albuquerque Lima</span>
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 font-bold">
                    LA
                </div>
            </div>
        </header>
    );
}
