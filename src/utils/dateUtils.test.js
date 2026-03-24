import { describe, it, expect } from 'vitest';
import { 
    getLocalDateISO, 
    getDayBoundaries, 
    formatDate, 
    formatTime, 
    formatDateTime 
} from './dateUtils';

describe('dateUtils - Timezone America/Sao_Paulo', () => {
    it('getLocalDateISO should return YYYY-MM-DD in SP timezone', () => {
        // Mocking current date/time is complex in native JS without libraries like sinon/msw
        // so we test with specific known dates
        const date = new Date('2024-03-24T01:00:00Z'); // 2024-03-23 22:00:00 SP (UTC-3)
        expect(getLocalDateISO(date)).toBe('2024-03-23');

        const date2 = new Date('2024-03-24T03:00:00Z'); // 2024-03-24 00:00:00 SP (UTC-3)
        expect(getLocalDateISO(date2)).toBe('2024-03-24');
    });

    it('formatDate should return DD/MM/YYYY in SP timezone', () => {
        const date = new Date('2024-03-24T01:00:00Z');
        expect(formatDate(date)).toBe('23/03/2024');
    });

    it('formatTime should return HH:mm in SP timezone', () => {
        const date = new Date('2024-03-24T01:00:00Z');
        expect(formatTime(date)).toBe('22:00');
    });

    it('getDayBoundaries should return correct midnight UTC ISO strings', () => {
        const date = new Date('2024-03-24T12:00:00Z');
        const { start, end } = getDayBoundaries(date);
        // SP 2024-03-24 (UTC-3) -> local midnight 00:00 is 03:00 UTC
        expect(start).toBe('2024-03-24T03:00:00.000Z');
        // SP 2024-03-24 23:59:59.999 is 2024-03-25 02:59:59.999 UTC
        expect(end).toBe('2024-03-25T02:59:59.999Z');
    });
});
