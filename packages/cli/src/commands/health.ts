import { Command } from 'commander';
import { getInstallShadowDiagnostic } from '../../../../core/runtime/install-diagnostics.js';
import { buildHealthState } from '../../../../core/runtime/trust-state.js';
import { formatHealthReport } from '../../../../core/runtime/trust-report.js';

export function registerHealthCommand(program: Command) {
  program
    .command('health')
    .description('Show runtime health for the current project')
    .option('-p, --project <project>', 'Project path')
    .option('--json', 'Emit machine-readable output', false)
    .action(async (options: any) => {
      const previousQuiet = process.env.SQUISH_QUIET;
      if (options.json) {
        process.env.SQUISH_QUIET = '1';
      }
      try {
        const installDiagnostic = getInstallShadowDiagnostic();
        if (installDiagnostic.status === 'broken') {
          const payload = {
            ok: false,
            error: 'shadowed_global_install',
            detail: installDiagnostic.detail,
            remediation: installDiagnostic.remediation,
            binaries: installDiagnostic.binaries,
          };
          if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.error(JSON.stringify(payload, null, 2));
          }
          process.exit(1);
        }

        const health = await buildHealthState(options.project);
        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...health }, null, 2));
          return;
        }
        console.log(formatHealthReport(health));
      } catch (error: any) {
        console.error(JSON.stringify({ ok: false, error: error.message }));
        process.exit(1);
      } finally {
        if (options.json) {
          if (previousQuiet === undefined) {
            delete process.env.SQUISH_QUIET;
          } else {
            process.env.SQUISH_QUIET = previousQuiet;
          }
        }
      }
    });
}
