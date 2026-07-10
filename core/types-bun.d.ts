declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function expect(value: any): {
    toBe(expected: any): void;
    toEqual(expected: any): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toContain(expected: any): void;
    toHaveLength(expected: number): void;
    toBeInstanceOf(expected: any): void;
    toThrow(): void;
    toBeNull(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    not: any;
  };
  export function mock<T extends (...args: any[]) => any>(fn?: T): T;
  export function spyOn(obj: any, method: string): any;
}

declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string);
    query(sql: string): any;
    exec(sql: string): void;
    close(): void;
  }
}
