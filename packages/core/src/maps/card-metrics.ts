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
