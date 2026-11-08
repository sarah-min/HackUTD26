// Minimal typing for the one node:crypto call in accounts.test.ts (the module package has no @types/node).
declare module 'node:crypto' {
  export function createHash(algo: string): { update(data: string): { digest(enc: string): string } };
}
