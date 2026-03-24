import { describe, it, expect } from 'vitest';
import { getStatusLabel, formatCurrency } from './orderUtils';

describe('orderUtils - Business Logic and Formatting', () => {
    describe('getStatusLabel', () => {
        it('should return correct Portuguese labels for known statuses', () => {
            expect(getStatusLabel('closed')).toBe('Fechado');
            expect(getStatusLabel('open')).toBe('Aberto');
            expect(getStatusLabel('scheduled')).toBe('Agendado');
            expect(getStatusLabel('no_show')).toBe('No-show');
            expect(getStatusLabel('canceled')).toBe('Cancelado');
        });

        it('should handle hyphenated no-show', () => {
            expect(getStatusLabel('no-show')).toBe('No-show');
        });

        it('should return the original status if unknown', () => {
            expect(getStatusLabel('unknown_status')).toBe('unknown_status');
        });

        it('should return "Indefinido" if status is null or undefined', () => {
            expect(getStatusLabel(null)).toBe('Indefinido');
            expect(getStatusLabel(undefined)).toBe('Indefinido');
        });
    });

    describe('formatCurrency', () => {
        it('should format numbers to BRL accurately', () => {
            const result = formatCurrency(1250.5);
            // Replace non-breaking spaces with normal spaces for comparison
            const cleanResult = result.replace(/\s/g, ' ');
            expect(cleanResult).toContain('R$');
            expect(cleanResult).toContain('1.250,50');
        });

        it('should handle zero and negative values', () => {
            expect(formatCurrency(0)).toContain('0,00');
            expect(formatCurrency(-10)).toContain('-R$');
        });

        it('should handle null/undefined as zero', () => {
            expect(formatCurrency(null)).toContain('0,00');
            expect(formatCurrency(undefined)).toContain('0,00');
        });
    });
});
