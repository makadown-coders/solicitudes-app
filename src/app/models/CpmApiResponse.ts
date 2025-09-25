import { CpmExpectedRow } from './CpmExpectedRow';

export type CpmApiResponse = { count: number; rows: CpmExpectedRow[]; } | CpmExpectedRow[];
