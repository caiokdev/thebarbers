const today = new Date('2026-03-24T00:01:10-03:00');
const nowMs = today.getTime();

const allOrdersRaw = [
    {
        id: '1',
        status: 'scheduled',
        total_amount: 50,
        scheduled_at: '2026-03-24T12:00:00Z', // Today 09:00
        professionals: { name: 'Caio' },
        clients: { name: 'John Doe' }
    },
    {
        id: '2',
        status: 'scheduled',
        total_amount: 60,
        scheduled_at: '2026-03-25T13:00:00Z', // Tomorrow 10:00
        professionals: { name: 'Marcos' },
        clients: { name: 'Jane Smith' }
    },
    {
        id: '3',
        status: 'closed',
        total_amount: 70,
        scheduled_at: '2026-03-24T08:00:00Z', // Past today
        professionals: { name: 'Caio' },
        clients: { name: 'Past Guy' }
    }
];

const proximosAtendimentos = [];

allOrdersRaw.forEach(o => {
    const status = o.status;
    if (status === 'scheduled' && o.scheduled_at) {
        const schedTime = new Date(o.scheduled_at).getTime();
        if (schedTime > nowMs) {
            const d2 = new Date(o.scheduled_at);
            const bName = o.professionals?.name || 'Sem Nome';
            const initials = bName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            proximosAtendimentos.push({
                _id: o.id,
                nome: bName,
                initials,
                cliente: o.clients?.name || 'Avulso',
                hora: d2.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
                data: d2.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }),
                scheduled_at: o.scheduled_at
            });
        }
    }
});

proximosAtendimentos.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

console.log('Resulting proximosAtendimentos:', JSON.stringify(proximosAtendimentos, null, 2));

if (proximosAtendimentos.length === 2 && proximosAtendimentos[1].nome === 'Marcos') {
    console.log('VERIFICATION SUCCESSFUL: Tomorrow\'s appointment included!');
} else {
    console.log('VERIFICATION FAILED');
    console.log('Length:', proximosAtendimentos.length);
}
