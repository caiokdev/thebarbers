import React from 'react';
import Accordion from './Accordion';

export default function Sidebar() {
    const menus = [
        "Dashboard", "Caixa", "Gestão", "Relatórios", "Financeiro", "Gestão",
        "Estoque", "Profissional", "Marketing e experiência", "Assinaturas",
        "Ticket médio", "Assinaturas", "Financeiro", "Marketing", "Minha Empresa"
    ];

    return (
        <aside className="w-64 bg-gray-900 text-white h-full flex flex-col flex-shrink-0">
            <div className="h-16 flex items-center justify-center border-b border-gray-800 font-bold text-xl tracking-wider">
                The Barbers Club
            </div>
            <div className="flex-1 overflow-y-auto">
                {menus.map((menu, index) => (
                    <Accordion key={index} title={menu} />
                ))}
            </div>
        </aside>
    );
}
