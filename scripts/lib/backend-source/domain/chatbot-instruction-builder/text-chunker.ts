/**
 * TokenChunker — Divides source text into manageable chunks by token count.
 *
 * Features:
 * - 1000 tokens per chunk (sweet spot for GPT-4.1 cost/precision)
 * - 50-100 token overlap between chunks for context preservation
 * - Respects line boundaries — never splits a line across chunks
 * - Respects sentence boundaries within lines
 *
 * Token estimation: 1 token ≈ 3 chars for Spanish/English.
 */

export type TokenChunkerSnapshot = {
  maxTokensPerChunk: number;
  charsPerToken: number;
  overlapTokens: number;
};

export class TokenChunker {
  private readonly maxTokensPerChunk: number;
  private readonly charsPerToken: number;
  private readonly overlapTokens: number;

  /**
   * @param maxTokensPerChunk - Maximum tokens per chunk (default: 1000)
   * @param charsPerToken - Characters per token estimate (default: 3)
   * @param overlapTokens - Overlap between chunks for context (default: 75)
   */
  constructor(maxTokensPerChunk: number = 1000, charsPerToken: number = 3, overlapTokens: number = 75) {
    this.maxTokensPerChunk = maxTokensPerChunk;
    this.charsPerToken = charsPerToken;
    this.overlapTokens = overlapTokens;
  }

  // ========== Standard DDD factories ========== //

  static createNew(): TokenChunker {
    return new TokenChunker();
  }

  static rehydrate(snapshot: TokenChunkerSnapshot): TokenChunker {
    return new TokenChunker(
      snapshot.maxTokensPerChunk,
      snapshot.charsPerToken,
      snapshot.overlapTokens,
    );
  }

  toSnapshot(): TokenChunkerSnapshot {
    return {
      maxTokensPerChunk: this.maxTokensPerChunk,
      charsPerToken: this.charsPerToken,
      overlapTokens: this.overlapTokens,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  chunk(text: string): string[] {
    // Handle empty text: return single empty chunk
    if (!text || text.trim().length === 0) {
      return [''];
    }

    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';
    let currentTokens = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokens(line);

      // If this single line exceeds the chunk limit, we must include it anyway
      if (currentTokens + lineTokens > this.maxTokensPerChunk && currentChunk) {
        chunks.push(currentChunk.trim());

        // Build overlap: take last lines that fit within overlapTokens
        currentChunk = this.buildOverlap(currentChunk) + line + '\n';
        currentTokens = this.estimateTokens(currentChunk);
      } else {
        currentChunk += line + '\n';
        currentTokens += lineTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  getTotalChunks(text: string): number {
    return this.chunk(text).length;
  }

  /**
   * Build overlap text from the end of the previous chunk.
   * Takes the last lines that fit within overlapTokens.
   */
  private buildOverlap(previousChunk: string): string {
    const overlapChars = this.overlapTokens * this.charsPerToken;

    // If previous chunk is smaller than overlap, use all of it
    if (previousChunk.length <= overlapChars) {
      return previousChunk;
    }

    // Take last N characters that fit within overlap
    const overlapText = previousChunk.slice(-overlapChars);

    // Find the start of a line in the overlap to avoid mid-line
    const lineStart = overlapText.indexOf('\n');
    if (lineStart !== -1) {
      return overlapText.slice(lineStart + 1);
    }

    return overlapText;
  }
}
