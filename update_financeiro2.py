import re

file_path = 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/src/pages/Financeiro.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The section we want to replace starts exactly here:
start_pattern = "    const { adminProfile, professionals, clients, loading: globalLoading } = useGlobalData();"
# And ends immediately before:
end_pattern = "    // ── Save expense ──"

idx_start = content.find(start_pattern)
idx_end = content.find(end_pattern)

if idx_start != -1 and idx_end != -1:
    new_block = """    const { theme } = useTheme();

    const {
        today, loading,
        selectedMonth, setSelectedMonth,
        isCurrentMonth, selectedMonthLabel, selYear,
        entradasHoje, saidasHoje, saldoDia,
        entradas7Dias, saidas7Dias, saldo7Dias,
        entradasMes, saidasMes, saldoMes,
        totalAssinantes, assinantesAtivos, assinantesAtrasados,
        listaSaidas, historicoComandas,
        showAllHistorico, setShowAllHistorico,
        currentPage, setCurrentPage, itemsPerPage,
        pedidosHoje, pedidos7Dias, pedidosMes, listaAssinantes,
        periodoComissao, setPeriodoComissao,
        comissoesPorBarbeiro,
        addExpense, verifyPassword, updateCommissionRate, payCommission
    } = useFinanceiroData();

    // ── Local UI States ──
    const [isCommissionUnlocked, setIsCommissionUnlocked] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordError, setIsPasswordError] = useState(false);
    const [checkingPassword, setCheckingPassword] = useState(false);
    const [expandedProfessionalId, setExpandedProfessionalId] = useState(null);

    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseDesc, setExpenseDesc] = useState('');
    const [savingExpense, setSavingExpense] = useState(false);

    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [detailsModalConfig, setDetailsModalConfig] = useState({ title: '', data: [], type: '' });
    const [expandedModalOrderId, setExpandedModalOrderId] = useState(null);
    const [expandedHistoricoOrderId, setExpandedHistoricoOrderId] = useState(null);

    // Confirmation Modal for Commission
    const [confirmModal, setConfirmModal] = useState({ open: false, targetData: null });

"""
    content = content[:idx_start] + new_block + content[idx_end:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print(f"FAILED TO FIND BLOCK: start {idx_start}, end {idx_end}")
