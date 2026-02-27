import React from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import KpiCard from '../components/KpiCard';
import Table from '../components/Table';

export default function Dashboard() {
    // Mocks de Dados para as Tabelas
    const topClientesData = [
        { nome: "Cliente avulso", servicos: 2, produtos: 0, assinatura: "Não", total: "R$ 60,00" },
        { nome: "José Roberto", servicos: 5, produtos: 1, assinatura: "Sim", total: "R$ 250,00" },
        { nome: "Laercio de Almeida", servicos: 4, produtos: 2, assinatura: "Não", total: "R$ 180,00" },
        { nome: "Igor Santos", servicos: 3, produtos: 0, assinatura: "Sim", total: "R$ 120,00" },
        { nome: "Fabio Andre", servicos: 1, produtos: 3, assinatura: "Não", total: "R$ 210,00" },
    ];

    const estoqueData = [
        { produto: "Pomada Coffe", min: 10, atual: 5, filial: "Matriz" },
        { produto: "Pomada Toque Seco", min: 15, atual: 2, filial: "Matriz" },
        { produto: "Pomada Black", min: 5, atual: 0, filial: "Filial Sul" },
        { produto: "Pomada Orange", min: 10, atual: 8, filial: "Matriz" },
        { produto: "Pomada Premium", min: 5, atual: 1, filial: "Filial Norte" },
    ];

    const pagamentosIncompletosData = [
        { nome: "Carlos Eduardo", plano: "Plano Ouro", status: "Pendente" },
        { nome: "Marcos Silva", plano: "Plano Prata", status: "Atrasado" },
    ];

    const aniversariantesData = [
        { nome: "João Pedro", data: "12/05" },
        { nome: "Rafael Costa", data: "15/05" },
    ];

    const recompraData = [
        { nome: "André Luiz", produto: "Óleo para Barba", data: "10/03/2023" },
        { nome: "Thiago Mendes", produto: "Shampoo Anticaspa", data: "05/04/2023" },
    ];

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Header />

                {/* Área de conteúdo scrollável */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* SEÇÃO 1 — BANNER */}
                    <section className="h-[180px] bg-gray-200 rounded-lg w-full flex items-center justify-center text-gray-400">
                        [Espaço para Imagem / Banner]
                    </section>

                    {/* SEÇÃO 2 — TEXTO ABAIXO DO BANNER */}
                    <section className="h-[60px] bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                        <h1 className="text-xl font-bold text-gray-800">The Barbers Club</h1>
                    </section>

                    {/* SEÇÃO 3 — VISÃO GERAL (CARDS DE KPI) */}
                    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard title="Profissionais cadastrados" value="2" />
                        <KpiCard title="Comandas abertas" value="40" />
                        <KpiCard title="Clientes" value="411" />
                        <KpiCard title="Erros de pré aprovação de planos" value="0" />
                    </section>

                    {/* SEÇÃO 4 — ORIGEM DE AGENDAMENTOS */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Origem de Agendamentos</h2>
                        <div className="bg-white p-5 border border-gray-200 rounded-lg grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-sm text-gray-500">Total</p>
                                <p className="text-2xl font-bold text-gray-800">397</p>
                            </div>
                            <div className="border-l border-gray-200">
                                <p className="text-sm text-gray-500">App</p>
                                <p className="text-2xl font-bold text-blue-600">65 <span className="text-sm text-gray-400">(16.37%)</span></p>
                            </div>
                            <div className="border-l border-gray-200">
                                <p className="text-sm text-gray-500">Recepção</p>
                                <p className="text-2xl font-bold text-green-600">332 <span className="text-sm text-gray-400">(83.63%)</span></p>
                            </div>
                        </div>
                    </section>

                    {/* SEÇÃO 5 — CONTRATOS */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Contratos</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-5 border border-gray-200 rounded-lg flex justify-between items-center">
                                <span className="font-medium text-gray-600">Contratos a vencer</span>
                                <span className="text-2xl font-bold text-gray-800">0</span>
                            </div>
                            <div className="bg-white p-5 border border-gray-200 rounded-lg flex justify-between items-center">
                                <span className="font-medium text-gray-600">Contratos pendentes</span>
                                <span className="text-2xl font-bold text-red-500">4</span>
                            </div>
                        </div>
                    </section>

                    {/* SEÇÃO 6 — CLIENTES QUE MAIS COMPRAM */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Clientes que mais compram</h2>
                        <Table
                            columns={['Nome', 'Serviços', 'Produtos', 'Assinatura', 'Total']}
                            data={topClientesData}
                        />
                    </section>

                    {/* SEÇÃO 7 — PRODUTOS COM ESTOQUE MÍNIMO */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Produtos com estoque mínimo</h2>
                        <Table
                            columns={['Produto', 'Estoque mínimo', 'Estoque atual', 'Filial']}
                            data={estoqueData}
                        />
                    </section>

                    {/* SEÇÃO 8 — CLIENTES COM PAGAMENTO INCOMPLETO */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Clientes com pagamento incompleto</h2>
                        <Table
                            columns={['Nome', 'Plano', 'Status']}
                            data={pagamentosIncompletosData}
                        />
                    </section>

                    {/* SEÇÃO 9 — ANIVERSARIANTES DA SEMANA */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Aniversariantes da semana</h2>
                        <Table
                            columns={['Nome', 'Data nascimento']}
                            data={aniversariantesData}
                        />
                    </section>

                    {/* SEÇÃO 10 — CLIENTES PARA RECOMPRA */}
                    <section>
                        <h2 className="text-lg font-bold mb-3 text-gray-700">Clientes para recompra</h2>
                        <Table
                            columns={['Nome', 'Produto', 'Data última compra']}
                            data={recompraData}
                        />
                    </section>

                </div>
            </main>
        </div>
    );
}
