

import { DCMImage } from "./parser";
import Series from "./image/series";

import Renderer  from "./renderer/Renderer";
import { ColorMap, makeRainbowPallette, makeRainbowColormap, makeColorPalletteFromMap}  from "./renderer/Utils";
import {IFrameInfo} from "./image/Types";

import {
	TransferSyntax,
	SliceDirection,
	Parser,
	parseImage,
} from "./parser";

export {
	TransferSyntax,
	SliceDirection,
	parseImage,
	Renderer,
	Parser,
	Series,
	DCMImage, 
	makeRainbowPallette, 
	makeRainbowColormap,
	makeColorPalletteFromMap
};
 export type { ColorMap,IFrameInfo };