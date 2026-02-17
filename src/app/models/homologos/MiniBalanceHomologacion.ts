import { MiniBalanceHomologoCand } from "./MiniBalanceHomologoCand";


export type MiniBalanceHomologacion = {
    total: number;
    mejores: MiniBalanceHomologoCand[]; // ya ordenados (top 3)
};
