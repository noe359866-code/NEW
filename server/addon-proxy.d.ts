import type { IncomingMessage, ServerResponse } from 'node:http';
export function createAddonHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
