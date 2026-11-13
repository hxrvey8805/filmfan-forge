import type { CSSProperties } from "react";

function palette(name: string, wall: [string, string, string], floor: [string, string],
  rug: [string, string], timber: [string, string], light: [string, string]) {
  const paint = {
    "--room-shadow": wall[0], "--room-wall": wall[1], "--room-lit-wall": wall[2],
    "--room-floor": floor[0], "--room-floor-dark": floor[1],
    "--room-rug": rug[0], "--room-weave": rug[1],
    "--room-timber": timber[0], "--room-wood-edge": timber[1],
    "--room-accent": light[0], "--room-lamplight": light[1],
  } satisfies Record<`--room-${string}`, string>;
  return { name, paint: paint as CSSProperties };
}

export const roomStyles = {
  // These paints are for the miniature. The full Original scene uses its own illustrated colours.
  original: palette("Original", ["#3c3859", "#655471", "#aa797b"], ["#946859", "#51483e"],
    ["#67516c", "#bf9584"], ["#6d4745", "#8e6152"], ["#78c9be", "#ffe4a7"]),
  amber: palette("Warm Amber", ["#29180f", "#62351e", "#97603b"], ["#825032", "#3d2115"],
    ["#733b21", "#dfa15f"], ["#4b2c1e", "#895a35"], ["#efb570", "#ffe0a2"]),
  navy: palette("Deep Navy", ["#0e1725", "#24374f", "#4d6680"], ["#36465a", "#182333"],
    ["#263d5c", "#93abc0"], ["#202b39", "#60514b"], ["#98c9ed", "#ffe0a7"]),
  forest: palette("Forest Green", ["#151e17", "#344332", "#67724d"], ["#4d5039", "#272e23"],
    ["#3b4832", "#bbab78"], ["#2e3528", "#686044"], ["#c6cb87", "#ffe2a0"]),
  burgundy: palette("Burgundy Lounge", ["#251017", "#582332", "#844654"], ["#64333b", "#301a22"],
    ["#612735", "#c28b79"], ["#43232b", "#7e4c43"], ["#f0a095", "#ffd59a"]),
  charcoal: palette("Charcoal Cinema", ["#151518", "#343236", "#635e59"], ["#484342", "#242328"],
    ["#3b383b", "#ac9482"], ["#302c2c", "#6b584b"], ["#d0b999", "#ffe3ba"]),
} as const;

export type RoomStyle = keyof typeof roomStyles;
export const roomStyleKeys = Object.keys(roomStyles) as RoomStyle[];
export const defaultRoomStyle: RoomStyle = "original";
export function decodeRoomStyle(value: string | null): RoomStyle | null {
  return value && Object.prototype.hasOwnProperty.call(roomStyles, value) ? value as RoomStyle : null;
}
