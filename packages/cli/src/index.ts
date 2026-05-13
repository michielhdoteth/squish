import { createProgram } from './program.js';

const program = createProgram();

// Default: show help if no arguments
if (process.argv.length === 2) {
  program.parse(['node', 'squish', '--help']);
} else {
  program.parse();
}
