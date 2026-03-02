/**
 * stores/index.ts — barrel re-exports.
 *
 * Import from '@/stores' instead of going to individual files.
 */
export { useCustomerStore } from "./customerStore";
export type { CustomerState } from "./customerStore";
export { filterTransactions, useTransactionStore } from "./transactionStore";
export type { TransactionState } from "./transactionStore";

