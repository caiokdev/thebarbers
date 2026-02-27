import React from 'react';

export default function Table({ columns, data }) {
    return (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        {columns.map((col, index) => (
                            <th key={index} className="p-3 text-sm font-semibold text-gray-600 uppercase tracking-wider">
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            {Object.values(row).map((val, colIndex) => (
                                <td key={colIndex} className="p-3 text-sm text-gray-800">
                                    {val}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
