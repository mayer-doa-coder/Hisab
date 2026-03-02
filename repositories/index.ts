/**
 * repositories/index.ts — barrel re-exports.
 *
 * Import from '@/repositories' instead of going to individual files.
 */
export type { ICustomerRepository } from "./ICustomerRepository";
export { SQLiteCustomerRepository } from "./SQLiteCustomerRepository";

