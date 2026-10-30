import type { Cell, Rect } from "../diagram/canvas.ts";
import type { El } from "../lang/library.ts";

export interface Tip {
	hint?: string;
	detail?: string;
	code?: string;
	language?: string;
	tone?: string;
	link?: string;
	linkLabel?: string;
}

export type TargetKind = "tab" | "button" | "choice" | "faq" | "node" | "copy" | "tip" | "image";

/** Something the user can click or reach with the keyboard. Rects are relative to the block that owns them. */
export interface Target {
	id: string;
	kind: TargetKind;
	rect: Rect;
	label: string;
	tip?: Tip;
	/** text sent to the assistant when activated */
	send?: string;
	openUrl?: string;
	copy?: string;
	/** extra cells (block coordinates) that belong to the target besides its rect, e.g. the wedge of a pie slice */
	cells?: Array<[number, number]>;
	/** for kind "image": where the picture goes and how big it is, in cells */
	image?: { key: string; cols: number; rows: number };
	/** a diagram that may be wider than its view: focusing this target should reveal it */
	pan?: { key: string; x: number; w: number; view: number; total: number };
}

export interface Block {
	w: number;
	rows: Cell[][];
	targets: Target[];
}

export interface WState {
	tab: Record<string, number>;
	faq: Record<string, boolean>;
	picked: Record<string, string>;
	pan: Record<string, number>;
	tip: string | null;
	focus: string | null;
	hover: string | null;
	copied: string | null;
}

export const newState = (): WState => ({ tab: {}, faq: {}, picked: {}, pan: {}, tip: null, focus: null, hover: null, copied: null });

/** Supplied by the host when it can draw bitmaps. Without it, an Image is drawn as a labelled frame. */
export interface ImageService {
	/** Load the image and reserve a size for it. Null when it cannot be drawn here (no protocol, unreadable, unsupported). */
	place(src: string, maxCols: number, maxRows: number): { key: string; cols: number; rows: number } | null;
	/** Human text for the frame when the picture itself cannot be shown, e.g. "800×600 png, 120 KB". */
	describe(src: string): string;
}

export interface Services {
	images?: ImageService;
}

export interface Ctx {
	state: WState;
	warnings: string[];
	services: Services;
	render: (el: El, width: number, path: string) => Block;
}
