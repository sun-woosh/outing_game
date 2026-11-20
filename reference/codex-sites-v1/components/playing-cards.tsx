import type { Card, CardRank, CardSuit } from "../lib/cards";
import "./playing-cards.css";

type Props = {
  cards?: readonly Card[];
  /** Compact cards for operator tables and scoreboards. */
  small?: boolean;
  /** Show one branded back per card, without exposing the card values. */
  hidden?: boolean;
  /** Empty hands normally show one branded card back. */
  emptyBack?: boolean;
};

const legacySuits: CardSuit[] = ["♥", "♠", "♦", "♣"];
const suitNames: Record<CardSuit, string> = { "♠": "스페이드", "♥": "하트", "♦": "다이아몬드", "♣": "클로버" };
const pipPositions: Record<number, readonly [number, number][]> = {
  1: [[50, 50]],
  2: [[50, 26], [50, 74]],
  3: [[50, 23], [50, 50], [50, 77]],
  4: [[32, 26], [68, 26], [32, 74], [68, 74]],
  5: [[32, 24], [68, 24], [50, 50], [32, 76], [68, 76]],
  6: [[32, 22], [68, 22], [32, 50], [68, 50], [32, 78], [68, 78]],
  7: [[32, 21], [68, 21], [50, 35], [32, 50], [68, 50], [32, 79], [68, 79]],
  8: [[32, 19], [68, 19], [32, 39], [68, 39], [32, 61], [68, 61], [32, 81], [68, 81]],
  9: [[32, 19], [68, 19], [32, 38], [68, 38], [50, 50], [32, 62], [68, 62], [32, 81], [68, 81]],
  10: [[32, 17], [68, 17], [50, 31], [32, 38], [68, 38], [32, 62], [68, 62], [50, 69], [32, 83], [68, 83]],
};

function face(card: Card, index: number): { rank: CardRank; suit: CardSuit } {
  if (typeof card !== "number") return card;
  // Existing games contain numeric cards; preserve the former suit convention.
  return { rank: (card === 1 ? "A" : String(card)) as CardRank, suit: legacySuits[index % legacySuits.length] };
}

function Back() {
  return <div className="pc-card pc-back" role="img" aria-label="Kearney 카드 뒷면">
    <div className="pc-back-frame"><div className="pc-back-mark"><span>✦</span><strong>KEARNEY</strong><small>2026 · MACAU</small></div></div>
  </div>;
}

/** A mirrored, engraved court portrait that stays sharp at every screen size. */
function CourtPortrait({ rank }: { rank: "J" | "Q" | "K" }) {
  const figure = <g stroke="#332725" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
    {/* Robe, collar and shoulders */}
    <path d="M23 69v-5c3-11 9-17 19-19h16c10 2 16 8 19 19v5Z" fill="#8e2634" />
    <path d="M26 65 40 49l10 14 10-14 14 16" fill="#234553" />
    <path d="m39 46 11 17-9-4-5-11m25-2L50 63l9-4 5-11" fill="#e5c480" />
    <path d="M43 37h14v12l-7 7-7-7Z" fill="#eac8a1" />
    {/* Hair and face */}
    <path d="M38 29c0-11 5-17 12-17s12 6 12 17v12l-6-4H44l-6 4Z" fill="#332725" />
    {rank === "Q" && <path d="M37 29c-2 8-3 14-1 19l6-3V29m21 0c2 8 3 14 1 19l-6-3V29" fill="#332725" />}
    <path d="M41 27c0-7 4-11 9-11s9 4 9 11v7c0 6-4 11-9 11s-9-5-9-11Z" fill="#f1d1ac" />
    <path d="M43 28h4m6 0h4m-8 2-1 5h3m-4 4q3 2 6 0" fill="none" strokeWidth="1" />
    {rank === "K" && <path d="M44 38q6 5 12 0l-1 5-5 3-5-3Z" fill="#49342b" />}
    {/* Crown or plumed cap */}
    {rank === "J"
      ? <><path d="M38 21q1-12 12-12t12 12l-3 3H41Z" fill="#d4a84d" /><path d="M53 11q7-10 12-4-7 1-7 10" fill="#f7ecd6" /></>
      : <path d="m38 22 1-12 6 5 5-8 5 8 6-5 1 12-4 3H42Z" fill="#d4a84d" />}
    <path d="M40 22h20" fill="none" stroke="#fff0cb" strokeWidth="1.4" />
    <path d="m30 60 5-5m35 5-5-5" fill="none" stroke="#f1d48f" strokeWidth="2" />
  </g>;
  return <svg className="pc-court-svg" viewBox="0 0 100 140" aria-hidden="true">
    <rect x="21" y="11" width="58" height="118" fill="#fbf2df" stroke="#b79b6c" strokeWidth="2" />
    <rect x="24" y="14" width="52" height="112" fill="none" stroke="#d6c09c" strokeWidth="1" />
    {figure}<g transform="rotate(180 50 70)">{figure}</g>
    <path d="M22 70h56" stroke="#d2b576" strokeWidth="3" />
    <path d="m46 70 4-3 4 3-4 3Z" fill="#f6e3b8" stroke="#5b3831" strokeWidth=".8" />
  </svg>;
}

function Face({ card, index }: { card: Card; index: number }) {
  const { rank, suit } = face(card, index);
  const court = rank === "J" || rank === "Q" || rank === "K";
  const positions = pipPositions[rank === "A" ? 1 : Number(rank)] ?? [];
  return <div className={`pc-card pc-face ${suit === "♥" || suit === "♦" ? "pc-red" : "pc-black"}`} role="img" aria-label={`${suitNames[suit]} ${rank}`}>
    <div className="pc-corner pc-top" aria-hidden="true"><b>{rank}</b><span>{suit}</span></div>
    {court ? <CourtPortrait rank={rank} /> : <svg className="pc-pips" viewBox="0 0 100 140" aria-hidden="true">{positions.map(([x, y], i) => <text key={i} x={x} y={20 + y} textAnchor="middle" dominantBaseline="central" fontSize={rank === "A" ? 49 : 21} transform={y > 50 ? `rotate(180 ${x} ${20 + y})` : undefined}>{suit}</text>)}</svg>}
    <div className="pc-corner pc-bottom" aria-hidden="true"><b>{rank}</b><span>{suit}</span></div>
  </div>;
}

export default function PlayingCards({ cards = [], small = false, hidden = false, emptyBack = true }: Props) {
  const backs = hidden ? Math.max(1, cards.length) : cards.length === 0 && emptyBack ? 1 : 0;
  return <div className={`pc-hand${small ? " pc-hand-small" : ""}`} aria-label={hidden || backs ? "카드 뒷면" : "받은 카드"}>
    {backs ? Array.from({ length: backs }, (_, index) => <Back key={index} />) : cards.map((card, index) => <Face key={index} card={card} index={index} />)}
  </div>;
}
