/**
 * Order and appointment utilities for The Barbers application.
 * Centralizes business logic for formatting and processing order data.
 */

/**
 * Returns a user-friendly label for a given order status.
 * @param {string} status 
 * @returns {string}
 */
export const getStatusLabel = (status) => {
    const statusLabels = {
        closed: 'Fechado',
        open: 'Aberto',
        scheduled: 'Agendado',
        'no_show': 'No-show',
        'no-show': 'No-show',
        canceled: 'Cancelado',
        pending: 'Pendente',
        error: 'Erro'
    };
    return statusLabels[status?.toLowerCase()] || status || 'Indefinido';
};

/**
 * Formats a numeric value into BRL currency string.
 * @param {number|string} value 
 * @returns {string}
 */
export const formatCurrency = (value) => {
    const amount = parseFloat(value || 0);
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatBRL = formatCurrency;

/**
 * Enriches order data with calculated fields and safe defaults for names.
 * @param {object} order 
 * @returns {object}
 */
export const enrichOrderData = (order) => {
    if (!order) return {};
    
    return {
        ...order,
        client_name: order.clients?.name || 'Cliente Avulso',
        professional_name: order.professionals?.name || 'Sem Barbeiro',
        display_status: getStatusLabel(order.status),
        total_value: formatCurrency(order.total_amount)
    };
};

/**
 * Validates if a string is a valid UUID (standard format).
 * @param {string} id 
 * @returns {boolean}
 */
export const isValidUUID = (id) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return !!id && UUID_REGEX.test(id);
};
