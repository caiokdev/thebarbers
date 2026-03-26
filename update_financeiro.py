import re

with open('c:/Users/CAIO/Desktop/Antigravityy/thebarbers/src/pages/Financeiro.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import for useFinanceiroData
content = content.replace("import * as XLSX from 'xlsx';", "import * as XLSX from 'xlsx';\nimport { useFinanceiroData } from '../hooks/useFinanceiroData';")

# 2. Replace the whole state block
start_str = "    const { adminProfile, loading: globalLoading, refreshData } = useGlobalData();"
end_str = "    // ── Save expense ──"

idx_start = content.find(start_str)
idx_end = content.find(end_str)

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


# 3. Replace handleSaveExpense
expense_start = "    async function handleSaveExpense() {"
expense_end = "    async function handleUnlock() {"
idx_ex_s = content.find(expense_start)
idx_ex_e = content.find(expense_end)
if idx_ex_s != -1 and idx_ex_e != -1:
    new_expense = """    async function handleSaveExpense() {
        if (!expenseDesc.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
            toast.error('Preencha a descrição e um valor válido.');
            return;
        }
        setSavingExpense(true);
        try {
            await addExpense(expenseDesc.trim(), parseFloat(expenseAmount));
            setIsExpenseModalOpen(false);
            setExpenseDesc('');
            setExpenseAmount('');
            toast.success('Saída registrada com sucesso.');
        } catch (err) {
            toast.error(`Erro ao registrar saída: ${err.message}`);
        } finally {
            setSavingExpense(false);
        }
    }

"""
    content = content[:idx_ex_s] + new_expense + content[idx_ex_e:]

# 4. Replace handleUnlock
unlock_start = "    async function handleUnlock() {"
unlock_end = "    async function handleEditRate("
idx_un_s = content.find(unlock_start)
idx_un_e = content.find(unlock_end)
if idx_un_s != -1 and idx_un_e != -1:
    new_unlock = """    async function handleUnlock() {
        if (!passwordInput) {
            setIsPasswordError(true);
            return;
        }
        setCheckingPassword(true);
        try {
            const isValid = await verifyPassword(passwordInput);
            if (isValid) {
                setIsCommissionUnlocked(true);
                setIsPasswordModalOpen(false);
                setPasswordInput('');
                setIsPasswordError(false);
            } else {
                setIsPasswordError(true);
            }
        } catch (err) {
            console.error('Erro ao verificar senha:', err);
            setIsPasswordError(true);
        } finally {
            setCheckingPassword(false);
        }
    }

"""
    content = content[:idx_un_s] + new_unlock + content[idx_un_e:]

# 5. Replace handleEditRate
rate_start = "    async function handleEditRate("
rate_end = "    async function handlePayCommission("
idx_ra_s = content.find(rate_start)
idx_ra_e = content.find(rate_end)
if idx_ra_s != -1 and idx_ra_e != -1:
    new_rate = """    async function handleEditRate(proId, proName) {
        const input = prompt(`Nova porcentagem de comissão para ${proName} (ex: 45):`);
        if (input === null) return;
        const newRate = parseFloat(input);
        if (isNaN(newRate) || newRate < 0 || newRate > 100) { toast.error('Valor inválido. Use um número entre 0 e 100.'); return; }
        try {
            await updateCommissionRate(proId, newRate);
            toast.success('Taxa atualizada.');
        } catch (error) {
            toast.error(`Erro: ${error.message}`);
        }
    }

"""
    content = content[:idx_ra_s] + new_rate + content[idx_ra_e:]

# 6. Replace handlePayCommission
pay_start = "    async function handlePayCommission(b) {"
pay_end = "    // ── Date label ──"
idx_pa_s = content.find(pay_start)
idx_pa_e = content.find(pay_end)
if idx_pa_s != -1 and idx_pa_e != -1:
    new_pay = """    function triggerPayCommission(b) {
        setConfirmModal({
            open: true,
            targetData: b
        });
    }

    async function handleConfirmPayCommission() {
        const b = confirmModal.targetData;
        if (!b) return;
        try {
            await payCommission(b);
            toast.success('Pagamento registrado no histórico!');
            setConfirmModal({ open: false, targetData: null });
        } catch (err) {
            toast.error(`Erro ao registrar: ${err.message}`);
        }
    }

"""
    content = content[:idx_pa_s] + new_pay + content[idx_pa_e:]

# 7. Replace onClick to handlePayCommission
content = content.replace("onClick={(e) => { e.stopPropagation(); handlePayCommission(b); }}", "onClick={(e) => { e.stopPropagation(); triggerPayCommission(b); }}")

# 8. Inject ConfirmModal before last closing tags
modal_inject = """                {
                    confirmModal.open && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                                <h3 className="text-lg font-bold text-slate-100 mb-2">Confirmar Pagamento</h3>
                                <p className="text-sm text-slate-400 mb-6">Confirma o pagamento de {formatCurrency(confirmModal.targetData?.valorComissao)} para {confirmModal.targetData?.nome}?</p>
                                <div className="flex gap-3">
                                    <button onClick={() => setConfirmModal({ open: false, targetData: null })} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors">Cancelar</button>
                                    <button onClick={handleConfirmPayCommission} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors">Confirmar</button>
                                </div>
                            </div>
                        </div>
                    )
                }
        </>
    );
"""
content = content.replace("        </>\n    );\n}", modal_inject + "}")

# 9. Clean up unused `const { themeColor, updateThemeColor, THEME_COLORS } = useTheme();`
content = content.replace("const { theme, themeColor, updateThemeColor, THEME_COLORS } = useTheme();", "const { theme } = useTheme();")

with open('c:/Users/CAIO/Desktop/Antigravityy/thebarbers/src/pages/Financeiro.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Update finished.")
