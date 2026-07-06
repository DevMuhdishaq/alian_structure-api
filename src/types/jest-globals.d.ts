/* Minimal Jest globals for TypeScript during e2e compilation.
   Jest itself is installed; this avoids ts errors in projects where test types aren't picked up by tsconfig. */

declare const describe: any;
declare const it: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const expect: any;



