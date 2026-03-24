/**
 * Date and time utilities for The Barbers application.
 * Ensures consistent formatting using the America/Sao_Paulo timezone.
 */

const DEFAULT_LOCALE = 'pt-BR';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Formats a date string or object into a localized date string.
 * @param {Date|string|number} date 
 * @param {string} locale 
 * @param {string} timeZone 
 * @returns {string}
 */
export const formatDate = (date, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Formats a date string or object into a localized time string.
 * @param {Date|string|number} date 
 * @param {string} locale 
 * @param {string} timeZone 
 * @returns {string}
 */
export const formatTime = (date, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleTimeString(locale, { timeZone, hour: '2-digit', minute: '2-digit' });
};

/**
 * Formats a date string or object into a localized date and time string.
 * @param {Date|string|number} date 
 * @param {string} locale 
 * @param {string} timeZone 
 * @returns {string}
 */
export const formatDateTime = (date, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleString(locale, { 
        timeZone, 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

/**
 * Returns a date string in YYYY-MM-DD format for the given date in the local timezone.
 * Replaces the fragile manual calculation: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
 * @param {Date} date 
 * @param {string} timeZone 
 * @returns {string}
 */
export const getLocalDateISO = (date = new Date(), timeZone = DEFAULT_TIMEZONE) => {
    const d = new Date(date);
    // Use toLocaleDateString to extract parts in the specific timezone
    const parts = d.toLocaleDateString('en-CA', { timeZone }).split('-'); // en-CA gives YYYY-MM-DD
    return parts.join('-');
};

/**
 * Returns the start and end of the day in ISO string format for the given date.
 * @param {Date} date 
 * @param {string} timeZone 
 * @returns {{ start: string, end: string }}
 */
export const getDayBoundaries = (date = new Date(), timeZone = DEFAULT_TIMEZONE) => {
    const isoDate = getLocalDateISO(date, timeZone);
    return {
        start: new Date(`${isoDate}T00:00:00`).toISOString(),
        end: new Date(`${isoDate}T23:59:59.999`).toISOString()
    };
};
