export declare function encrypt(plain: string, passphrase?: string): {
    ciphertext: string;
    nonce: string;
};
export declare function decrypt(ciphertext: string, nonceB64: string, passphrase?: string): string;
//# sourceMappingURL=encrypt.d.ts.map