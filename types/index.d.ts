/**
 * Where each text block of a reply starts counting: the number of lines the
 * reply's earlier text blocks took, so a reply reads 1, 2, 3, ... throughout.
 */
export type Starts = {
  /** By block, keyed by `textKey(text)`. */
  byText: Record<string, number>
  /** Where the next block of the reply in progress starts. */
  pending: number
}
