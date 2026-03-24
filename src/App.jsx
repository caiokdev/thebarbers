import React from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import PDV from './pages/PDV';
import Financeiro from './pages/Financeiro';
import HistoricoComissoes from './pages/HistoricoComissoes';
import Clientes from './pages/Clientes';
import Relatorios from './pages/Relatorios';
import Estoque from './pages/Estoque';
import Configuracoes from './pages/Configuracoes';
import AgendamentoPublico from './pages/AgendamentoPublico';
import Automacoes from './pages/Automacoes';
import Planos from './pages/Planos';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import { GlobalDataProvider } from './context/GlobalDataContext';

function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <Toaster position="top-right" richColors />
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/agendar" element={<AgendamentoPublico />} />

                    {/* Protected Admin Routes */}
                    <Route element={
                        <PrivateRoute>
                            <GlobalDataProvider>
                                <Layout />
                            </GlobalDataProvider>
                        </PrivateRoute>
                    }>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/agenda" element={<Agenda />} />
                        <Route path="/pdv/:id" element={<PDV />} />
                        <Route path="/financeiro" element={<Financeiro />} />
                        <Route path="/historico-comissoes" element={<HistoricoComissoes />} />
                        <Route path="/clientes" element={<Clientes />} />
                        <Route path="/estoque" element={<Estoque />} />
                        <Route path="/relatorios" element={<Relatorios />} />
                        <Route path="/configuracoes" element={<Configuracoes />} />
                        <Route path="/automacoes" element={<Automacoes />} />
                        <Route path="/planos" element={<Planos />} />
                    </Route>
                    
                    {/* Fallback */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;
