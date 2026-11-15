// The difficulty and subject pickers shared by the Classic and Duel setup screens.
import Phaser from "phaser";
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from "../../config";
import { pvp } from "../../net/pvp";
import { saveDifficulty, saveLoadout, saveSubjects, state } from "../../state";
import { FONT, MUTED_CSS } from "../palette";
import { pickSpell, SPELL_IDS, SPELLS } from "../spells";
import { SUBJECT_INFO, SUBJECTS, toggleSubject, type Subject } from "../subjects";
import type { Menu } from "./Menu";

/** In a friend match the host picks for both players. */
export const guestLocked = () => pvp.active && !pvp.isHost;

export function pickDifficulty(d: Difficulty) {
  if (guestLocked() || state.difficulty === d) return;
  saveDifficulty(d);
  pvp.sendMode();
}

export function pickSubject(s: Subject) {
  if (guestLocked()) return;
  saveSubjects(toggleSubject(state.subjects, s));
  pvp.sendMode();
}

/** Easy / Medium / Hard. Keys 1–3 work too. Returns the line under it that describes the pick. */
export function difficultyRow(scene: Phaser.Scene, menu: Menu, cx: number, y: number, w = 160, h = 48, lockable = false) {
  const keys = ["ONE", "TWO", "THREE"];
  DIFFICULTIES.forEach((d, i) => {
    menu.add({
      x: cx + (i - 1) * (w + 22),
      y,
      w,
      h,
      label: DIFFICULTY[d].label,
      angle: i === 1 ? 0.8 : -1.2,
      selected: () => state.difficulty === d,
      enabled: () => !(lockable && guestLocked()) || state.difficulty === d,
      onClick: () => pickDifficulty(d),
    });
    scene.input.keyboard?.on(`keydown-${keys[i]}`, () => pickDifficulty(d));
    scene.input.keyboard?.on(`keydown-NUMPAD_${keys[i]}`, () => pickDifficulty(d));
  });
  return scene.add.text(cx, y + h / 2 + 20, "", { fontFamily: FONT, fontSize: "17px", color: MUTED_CSS }).setOrigin(0.5);
}

/** One chip per subject; any number can be on. */
export function subjectChips(menu: Menu, cx: number, y: number, w: number, h: number, gap: number, lockable = false) {
  SUBJECTS.forEach((s, i) => {
    menu.add({
      x: cx + (i - (SUBJECTS.length - 1) / 2) * (w + gap),
      y,
      w,
      h,
      glyph: SUBJECT_INFO[s].glyph,
      label: SUBJECT_INFO[s].label,
      fontSize: Math.min(22, Math.round(w / 6.4)),
      angle: i % 2 ? 0.9 : -0.9,
      selected: () => state.subjects.includes(s),
      enabled: () => !(lockable && guestLocked()) || state.subjects.includes(s),
      onClick: () => pickSubject(s),
    });
  });
}

/** ASL reads handshapes, so it can't be played with the mouse. */
export const cameraNeeded = () => state.subjects.includes("asl") && state.mode !== "hand";

/**
 * The spell deck: every spell as a card, two of them picked to bring into a round. Picking a
 * third swaps out the one picked longest ago. Returns the line that says how the two are cast.
 */
export function spellDeck(scene: Phaser.Scene, menu: Menu, cx: number, y: number, w: number, h: number, gap: number, cols: number, captionWidth: number) {
  const rows = Math.ceil(SPELL_IDS.length / cols);
  SPELL_IDS.forEach((id, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    menu.add({
      x: cx + (col - (cols - 1) / 2) * (w + gap),
      y: y + row * (h + gap),
      w,
      h,
      glyph: SPELLS[id].glyph,
      label: `${SPELLS[id].name} · ${SPELLS[id].cost}`,
      fontSize: Math.min(20, Math.round(w / 7)),
      angle: i % 2 ? 0.9 : -0.9,
      selected: () => state.loadout.includes(id),
      onClick: () => saveLoadout(pickSpell(state.loadout, id)),
    });
  });
  return scene.add
    .text(cx, y + (rows - 1) * (h + gap) + h / 2 + 12, "", { fontFamily: FONT, fontSize: "17px", color: MUTED_CSS, align: "center", wordWrap: { width: captionWidth } })
    .setOrigin(0.5, 0);
}
