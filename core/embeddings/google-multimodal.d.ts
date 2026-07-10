export interface MultimodalInput {
    text?: string;
    image?: Buffer | string;
    video?: string;
}
export interface GoogleMultimodalResponse {
    embedding: number[];
    textEmbedding?: number[];
    imageEmbedding?: number[];
    videoEmbedding?: number[];
}
export declare function getGoogleMultimodalEmbedding(input: MultimodalInput): Promise<GoogleMultimodalResponse | null>;
export declare function isMultimodalInput(input: any): input is MultimodalInput;
//# sourceMappingURL=google-multimodal.d.ts.map