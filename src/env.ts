import { existsSync } from 'node:fs';

import { config } from 'dotenv';

// Load .env first (base config)
config({ path: '.env' });

// Load .env.local if it exists (overrides)
if (existsSync('.env.local')) {
    config({ path: '.env.local', override: true });
}
