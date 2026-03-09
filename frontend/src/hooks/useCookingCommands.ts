import { useEffect, useRef, useCallback } from 'react';

export type CookingCommand =
  | { type: 'next_step' }
  | { type: 'prev_step' }
  | { type: 'go_to_step'; step: number }
  | { type: 'read_step' }
  | { type: 'set_timer'; seconds: number }
  | { type: 'pause_timer' }
  | { type: 'reset_timer' }
  | { type: 'ingredient_query'; ingredient: string; answer: string | null }
  | { type: 'done_cooking' }
  | { type: 'unknown'; text: string };

interface Ingredient {
  amount: string;
  item: string;
}

function parseTimer(text: string): number | null {
  // "set timer for 2 minutes 30 seconds", "timer 5 min", "15 minutes"
  const timerMatch = text.match(
    /(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+(?:for\s+)?)(\d+)\s*(minute|min|second|sec|hour|hr)s?(?:\s+(?:and\s+)?(\d+)\s*(minute|min|second|sec)s?)?/i
  );
  if (!timerMatch) {
    // Bare "15 minutes" with no "timer" keyword — only if combined with timer-like context
    const bareMatch = text.match(/^(\d+)\s*(minute|min|second|sec)s?\s*timer$/i);
    if (bareMatch) {
      return toSeconds(parseInt(bareMatch[1]), bareMatch[2]);
    }
    return null;
  }

  let total = toSeconds(parseInt(timerMatch[1]), timerMatch[2]);
  if (timerMatch[3] && timerMatch[4]) {
    total += toSeconds(parseInt(timerMatch[3]), timerMatch[4]);
  }
  return total;
}

function toSeconds(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('hour') || u.startsWith('hr')) return value * 3600;
  if (u.startsWith('min')) return value * 60;
  return value;
}

function findIngredient(query: string, ingredients: Ingredient[]): { ingredient: string; answer: string | null } {
  const q = query.toLowerCase().trim();

  // Try substring match in both directions
  for (const ing of ingredients) {
    const name = ing.item.toLowerCase();
    if (name.includes(q) || q.includes(name)) {
      return { ingredient: ing.item, answer: `${ing.amount} ${ing.item}` };
    }
  }

  // Word overlap fallback
  const qWords = new Set(q.split(/\s+/));
  let best: Ingredient | null = null;
  let bestOverlap = 0;

  for (const ing of ingredients) {
    const words = new Set(ing.item.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of qWords) {
      if (words.has(w)) overlap++;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = ing;
    }
  }

  if (best && bestOverlap > 0) {
    return { ingredient: best.item, answer: `${best.amount} ${best.item}` };
  }

  return { ingredient: q, answer: null };
}

export function useCookingCommands(
  transcript: string,
  ingredients: Ingredient[],
  onCommand: (cmd: CookingCommand) => void
) {
  const lastProcessedRef = useRef('');
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const parseCommand = useCallback((text: string): CookingCommand => {
    const t = text.toLowerCase().trim();

    // Navigation
    if (/\b(next\s*step|next|go\s*forward|move\s*on)\b/.test(t)) {
      return { type: 'next_step' };
    }
    if (/\b(previous|prev|go\s*back|back|last\s*step)\b/.test(t)) {
      return { type: 'prev_step' };
    }
    // "go to step 3"
    const stepMatch = t.match(/(?:go\s*to\s*step|step)\s*(\d+)/);
    if (stepMatch) {
      return { type: 'go_to_step', step: parseInt(stepMatch[1]) };
    }

    // Read/repeat
    if (/\b(read|read\s*(?:this\s*)?step|repeat|say\s*(?:it\s*)?again|read\s*it)\b/.test(t)) {
      return { type: 'read_step' };
    }

    // Timer
    const timerSeconds = parseTimer(t);
    if (timerSeconds !== null) {
      return { type: 'set_timer', seconds: timerSeconds };
    }
    if (/\b(pause|stop\s*timer)\b/.test(t)) {
      return { type: 'pause_timer' };
    }
    if (/\b(reset\s*timer|clear\s*timer|cancel\s*timer)\b/.test(t)) {
      return { type: 'reset_timer' };
    }

    // Ingredient query
    const ingredientMatch = t.match(/\bhow\s+much\s+(.+)/);
    if (ingredientMatch) {
      const result = findIngredient(ingredientMatch[1], ingredients);
      return { type: 'ingredient_query', ...result };
    }
    // "what do I need for [ingredient]"
    const whatMatch = t.match(/\bwhat\s+(?:do\s+I\s+)?need\s+(?:for\s+)?(.+)/);
    if (whatMatch) {
      const result = findIngredient(whatMatch[1], ingredients);
      return { type: 'ingredient_query', ...result };
    }

    // Done
    if (/\b(i'?m\s*done|done\s*cooking|finished|all\s*done|mark\s*(?:as\s*)?done)\b/.test(t)) {
      return { type: 'done_cooking' };
    }

    return { type: 'unknown', text };
  }, [ingredients]);

  useEffect(() => {
    if (!transcript || transcript === lastProcessedRef.current) return;
    lastProcessedRef.current = transcript;

    const cmd = parseCommand(transcript);
    onCommandRef.current(cmd);
  }, [transcript, parseCommand]);
}
