import { applyActiveDataset } from './services/datasets.js';

// Imported by server.ts right after dotenv, so the remembered local data set
// (services/datasets.ts) is in the env before any module opens a database.
const dataset = applyActiveDataset();
if (dataset !== 'dev') console.log(`Local data set: ${dataset}`);
