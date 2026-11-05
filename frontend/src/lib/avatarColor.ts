import { presetPalettes } from '@ant-design/colors';

// Hues for the hashed colour, as [preset, index]. presetPalettes[hue] is 0-indexed, so index 6 is
// Ant's "-7" shade. Yellow, lime, gold and orange are too light for white initials. Index 6 gives
// at least 4.5:1 against white (AA) for red 5.57, volcano 4.80, blue 6.16, geekblue 8.63, purple 9.85
// and magenta 5.48. Green (3.46) and cyan (3.55) fail there, so they use index 7: 5.59 and 6.10.
// Order is fixed: it decides which name gets which colour.
const AVATAR_COLORS = (
  [['red', 6], ['volcano', 6], ['green', 7], ['cyan', 7], ['blue', 6], ['geekblue', 6], ['purple', 6], ['magenta', 6]] as const
).map(([hue, shade]) => presetPalettes[hue][shade]);

/** Contrast-safe background for white initials, hashed from a name */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
