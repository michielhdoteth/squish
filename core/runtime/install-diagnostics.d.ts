export interface BinaryResolution {
    command: string;
    paths: string[];
}
export interface InstallShadowDiagnostic {
    status: 'ok' | 'broken';
    detail: string;
    remediation: string[];
    binaries: BinaryResolution[];
}
export declare function assessInstallShadowing(binaries: BinaryResolution[]): InstallShadowDiagnostic;
export declare function getInstallShadowDiagnostic(): InstallShadowDiagnostic;
//# sourceMappingURL=install-diagnostics.d.ts.map