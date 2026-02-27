import React from 'react';

export default function KpiCard({ title, value }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col justify-center shadow-sm">
            <h3 className="text-gray-500 text-sm font-medium mb-2">{title}</h3>
            <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
    );
}
