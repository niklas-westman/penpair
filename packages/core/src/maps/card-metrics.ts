/**
 * Open node card: a flex column that grows with its text.
 *
 * Arrows attach at the middle of the illustration region, which is a fixed distance from the
 * card's top whatever the text below does, so the planner works with `mapCardAnchorHeight` as
 * the node's height. `mapCardHeight` is only the estimate used to space rows and notes.
 */
export const mapCardWidth = 216;
export const mapCardHeight = 300;
/** Illustration region: 20 padding, a 132 px illustration, 20 padding. Arrows meet its middle. */
export const mapCardAnchorHeight = 172;
/** Two lines of 16px title and of 12px summary fit these many characters. */
export const mapCardTitleLimit = 32;
export const mapCardSummaryLimit = 52;

/** Vertical space between two cards stacked in one column, which leaves room for connectors. */
export const mapCardRowGap = 128;

const lines = (text: string, perLine: number): number =>
  Math.max(1, Math.ceil(text.length / perLine));

/**
 * Height of a card once its text has flowed: padding, illustration, title, summary and status.
 * Characters per line are conservative, so the estimate is never smaller than the real card.
 */
export function mapCardEstimate(card: {
  title: string;
  summary?: string;
  hasStatus: boolean;
}): number {
  return (
    20 +
    132 +
    10 +
    lines(card.title, 18) * 21 +
    (card.summary ? 10 + lines(card.summary, 26) * 16 : 0) +
    10 +
    (card.hasStatus ? 24 : 16) +
    16 +
    4
  );
}
