import React, { useState } from 'react';

export default function Accordion({ title }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-gray-800">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left p-4 hover:bg-gray-800 flex justify-between items-center text-gray-300 transition-colors"
            >
                <span>{title}</span>
                <span>{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
                <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400">
                    <ul className="space-y-2">
                        <li className="hover:text-white cursor-pointer py-1">Subitem fictício 1</li>
                        <li className="hover:text-white cursor-pointer py-1">Subitem fictício 2</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
