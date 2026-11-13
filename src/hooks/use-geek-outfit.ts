import { useViewerPreference } from "./use-viewer-preference";
export { GeekViewer } from "./use-viewer-preference";

export const DEFAULT_OUTFIT = "classic";
export const outfits = {
  classic: { name: "Arcade", detail: "Teal hoodie with a clapperboard pin." },
  breaking: { name: "Breaking Geek", detail: "A black pork-pie hat, goatee and desert jacket." },
  stranger: { name: "Stranger Geek", detail: "An ’80s trucker cap, bright windbreaker and walkie-talkie." },
  trek: { name: "Trek Geek", detail: "Pointed ears, a red bridge uniform and a gold communicator." },
  matrix: { name: "Matrix Geek", detail: "A black trench coat and falling green code." },
  jurassic: { name: "Jurassic Geek", detail: "A field hat, red neckerchief and dinosaur-track patch." },
  jedi: { name: "Jedi Geek", detail: "Sand-coloured robes and a green lightsaber. He uses the Force to float popcorn to his mouth." },
  chucky: { name: "Chucky Geek", detail: "Copper hair, rainbow sleeves and blue denim overalls." },
  karate: { name: "Karate Geek", detail: "A white gi, tied headband and knotted black belt." },
  mha: { name: "My Hero Geek", detail: "Deku-inspired green curls, a silver neck guard and red hero boots." },
  peaky: { name: "Peaky Geek", detail: "A herringbone flat cap, a tweed waistcoat and a brass pocket watch." },
  spider: { name: "Spider-Geek", detail: "A red web-stitched hoodie with a navy lining and a web spinner at the wrist." },
  hogwarts: { name: "Hogwarts Geek", detail: "Midnight school robes, a scarlet-and-gold scarf and a wand with a star at its tip." },
  thrones: { name: "Game of Geek", detail: "A black fur mantle, crossed leather belts and a frost-touched sword with a white wolf pommel." },
  pulp: { name: "Pulp Geek", detail: "Tight curls, a sharp black suit and a briefcase with a golden secret." },
  social: { name: "Social Geek", detail: "A grey campus hoodie and an open laptop balanced in one hand. The other waves hello." },
  squid: { name: "Squid Geek", detail: "Player 456 in a green tracksuit, with a circle, triangle and square stamped on his invitation." },
  dune: { name: "Dune Geek", detail: "Paul Atreides’ curls, desert scarf and stillsuit. His ivory crysknife catches the light as spice drifts past." },
  scar: { name: "Scar-Geek", detail: "Tony Montana’s red island-print shirt, cream trousers and gold chain. A crooked half-smile and a two-finger salute." },
  gladiator: { name: "Gladiator Geek", detail: "Maximus’s short crop, trimmed beard and dark leather arena armour. His round shield rests beside the chair at movie time." },
  wolf: { name: "Wolf of Geek", detail: "Wall Street pinstripes, slicked-back hair and a gold watch. He’s got a pen to sell you." },
} as const;
export type Outfit = keyof typeof outfits;

function decodeOutfit(value: string | null): Outfit | null {
  if (value === "noir") return "matrix";
  if (value === "orbit") return "jurassic";
  if (value === "scream") return "chucky";
  return value && Object.prototype.hasOwnProperty.call(outfits, value) ? value as Outfit : null;
}

export function useGeekOutfit() {
  const { value: look, choose, ready } = useViewerPreference("geek", DEFAULT_OUTFIT, decodeOutfit);
  return { look, choose, ready };
}
