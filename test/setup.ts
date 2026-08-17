import { join } from 'node:path';

export default function () {
    try {
        process.loadEnvFile(join(__dirname, '../.env'));
    } catch {
        // .env is optional (e.g. in CI where env vars are injected directly)
    }
}
