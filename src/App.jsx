import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import PDV from './pages/PDV';
import Financeiro from './pages/Financeiro';
import Clientes from './pages/Clientes';
import Relatorios from './pages/Relatorios';
import Estoque from './pages/Estoque';
import Configuracoes from './pages/Configuracoes';

function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/agenda" element={<Agenda />} />
                    <Route path="/pdv/:id" element={<PDV />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/estoque" element={<Estoque />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
