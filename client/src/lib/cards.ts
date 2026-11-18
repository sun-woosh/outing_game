/** Legacy games store numbers; newly dealt cards also include their real suit. */
export type CardRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type CardSuit = "♠" | "♥" | "♦" | "♣";
export type Card = number | { rank: CardRank; suit: CardSuit };
