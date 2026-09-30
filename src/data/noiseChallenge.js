// Timing shared between the Noise Challenge (DecibelMeter), the points
// count it triggers (App), and the student list it pops open (PeriodBar),
// so the three stay in step.

// How long a challenge's reward/cost takes to count onto the points.
export const CHALLENGE_COUNT_MS = 2000;

// How long the student list stays up after a challenge result opens it:
// the points count plus a short beat to see the final totals.
export const CHALLENGE_LIST_CLOSE_MS = CHALLENGE_COUNT_MS + 1000;

// When auto-repeat starts the next round (and so resets the average) after
// a result that changed points: just after the student list has closed, so
// noise during the celebration doesn't count toward the new round.
export const CHALLENGE_REPEAT_DELAY_MS = CHALLENGE_LIST_CLOSE_MS + 250;
