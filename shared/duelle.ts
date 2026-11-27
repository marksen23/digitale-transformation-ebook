/**
 * Begriffs-Duelle. Beide Seiten sind Knoten des Netzes.
 */
export interface DuelSide {
  id: string;
  label: string;
}

export interface Duel {
  id: string;
  title: string;
  question: string;
  a: DuelSide;
  b: DuelSide;
}

export const DUELS: Duel[] = [
  {
    id: "echo-resonanz",
    title: "Echo oder Resonanz",
    question: "Was trägt eine Antwort: die Wiederholung oder die Verwandlung?",
    a: { id: "echo", label: "Echo" },
    b: { id: "resonanz", label: "Resonanz" },
  },
  {
    id: "schatten-licht",
    title: "Schatten oder Licht",
    question: "Woran wird eine Gestalt erkennbar?",
    a: { id: "schatten", label: "Schatten" },
    b: { id: "licht", label: "Licht" },
  },
  {
    id: "freiheit-gelassenheit",
    title: "Freiheit oder Gelassenheit",
    question: "Was lässt das Unverfügbare sein: der Griff oder das Lassen?",
    a: { id: "freiheit", label: "Freiheit" },
    b: { id: "gelassenheit", label: "Gelassenheit" },
  },
];

export function duelById(id: string): Duel | undefined {
  return DUELS.find(duel => duel.id === id);
}
