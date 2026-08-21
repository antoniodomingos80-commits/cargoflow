/**
 * Liga o resolvedor de alias antes de o teste correr.
 *
 * Usado via `node --import ./tests/alias-register.mjs`.
 */
import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
