/**
 * services/index.ts — barrel re-exports.
 *
 * Import from '@/services' instead of going to individual files.
 * The database sub-module is intentionally not re-exported here
 * because it is an implementation detail consumed only by _layout.tsx.
 */
export { customerService } from "./customerService";
export {
    DatabaseError, HisabError, NotFoundError, ValidationError, toMessage
} from "./errors";
export { transactionService } from "./transactionService";
export {
    PHONE_RE, validateAmount, validateName, validateNickname, validateNote, validatePhone
} from "./validation";

